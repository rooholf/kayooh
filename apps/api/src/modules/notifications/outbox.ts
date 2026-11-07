/**
 * Transactional outbox for FR-NOT-01.
 *
 * The outbox is the seam that guarantees "notification failure MUST NOT roll
 * back or block the business transaction" (FR-NOT-01.4): the business module
 * calls `enqueueNotification(tx, ...)` INSIDE its transaction, which writes
 * both a `notifications` row and an `outbox_events` row atomically with the
 * business data, and NOTHING is sent there.
 *
 * Delivery (SRS §8 jobs table, FR-NOT-01.2):
 *   - `outbox-dispatch` (every 5 s) claims undispatched `notification.send`
 *     outbox rows by setting `dispatched_at` in the same transaction (the SRS
 *     idempotency mechanism), then hands each to a BullMQ `notification-send`
 *     job (Redis path) or delivers inline (Redis-less floor, dev/test).
 *   - `notification-send` runs `deliverNotification` with BullMQ-native
 *     `attempts: 5, backoff exponential 30 s`. On Redis-less deployments
 *     `next_attempt_at` carries the same ladder for the floor.
 *   - Up to 5 attempts; after the fifth failure the row is `failed`, an
 *     `audit_log` entry is written, and — WhatsApp only — the same template
 *     is re-enqueued by EMAIL when the user has one (FR-NOT-01.3).
 *
 * The OTP path (FR-ID-01) stays synchronous through its provider and never
 * enters the outbox: a login must not wait on BullMQ.
 *
 * Money is never involved here (notifications carry display vars only); the
 * deposit/payment top-up path stays bigint in its own module (INV-5).
 */
import { and, eq, inArray, isNull, type TxOrDb } from "@repo/db";
import { db, auditLog, notifications, outboxEvents, users } from "@repo/db";
import type { NotificationChannel, NotificationProvider, NotificationTemplateName } from "../../lib/types.js";
import { createNotificationProvider } from "../../lib/notifications.js";
import { loadEnv } from "../../lib/env.js";

export interface EnqueueNotificationInput {
  /** Null for a guest renter (no users row); the recipient is then `to`. */
  userId: string | null;
  template: NotificationTemplateName;
  channel: NotificationChannel;
  vars: Record<string, string | number | boolean>;
  /** Override for guest/owner routing; defaults to the user's address. */
  to?: string;
}

/**
 * Inserts the `notifications` row + the matching `outbox_events` row in the
 * SAME transaction as the caller's business writes. Returns the notification
 * id. The send itself is deferred to the outbox dispatch; this function never
 * awaits a network call.
 */
export async function enqueueNotification(
  tx: TxOrDb,
  input: EnqueueNotificationInput,
): Promise<string> {
  const inserted = await tx
    .insert(notifications)
    .values({
      userId: input.userId,
      channel: input.channel,
      template: input.template,
      vars: input.vars,
      status: "queued",
    })
    .returning({ id: notifications.id });
  const row = inserted[0];
  if (!row) throw new Error("notification insert returned no row");

  await tx.insert(outboxEvents).values({
    type: "notification.send",
    payload: { notificationId: row.id, to: input.to ?? null },
  });

  return row.id;
}

/** BullMQ job payload for a single notification delivery attempt. */
export interface NotificationJobData {
  notificationId: string;
  to?: string | null;
}

/**
 * Backoff ladder for FR-NOT-01.2 (ms): exponential, starting at 30 s.
 * Index `attempts - 1` (attempts 1..4 schedule the next attempt); the 5th
 * failure is terminal, so the 480 s slot exists for parity with the BullMQ
 * ladder (30/60/120/240/480) but is never scheduled from here.
 */
export const NOTIFICATION_BACKOFF_MS = [30_000, 60_000, 120_000, 240_000, 480_000] as const;
export const NOTIFICATION_MAX_ATTEMPTS = 5;

export interface DeliverNotificationOptions {
  /** Injectable provider (tests); defaults to the env-selected provider. */
  provider?: NotificationProvider;
}

/**
 * Processes one notification delivery attempt. Runs in the BullMQ worker (or
 * the Redis-less floor), AFTER the business transaction has committed. Never
 * throws: a provider failure only advances the row's attempt bookkeeping —
 * sending never fails the caller's flow.
 */
export async function deliverNotification(
  data: NotificationJobData,
  opts: DeliverNotificationOptions = {},
): Promise<void> {
  const provider =
    opts.provider ??
    (() => {
      const env = loadEnv();
      return createNotificationProvider({ nodeEnv: env.nodeEnv, devLogOtp: env.devLogOtp });
    })();

  const rows = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      channel: notifications.channel,
      template: notifications.template,
      vars: notifications.vars,
      status: notifications.status,
      attempts: notifications.attempts,
    })
    .from(notifications)
    .where(eq(notifications.id, data.notificationId))
    .limit(1);

  const row = rows[0];
  if (!row) return; // already gone / replayed

  // Resolve the recipient address (phone for whatsapp, email for email).
  const userRows =
    row.userId === null
      ? []
      : await db
          .select({ email: users.email, phoneNumber: users.phoneNumber })
          .from(users)
          .where(eq(users.id, row.userId))
          .limit(1);
  const user = userRows[0];
  const to = data.to ?? (row.channel === "whatsapp" ? user?.phoneNumber ?? undefined : user?.email ?? undefined);
  if (!to) return; // unreachable address: the row stays queued, nothing to send to

  try {
    await provider.send({
      channel: row.channel as NotificationChannel,
      template: row.template as NotificationTemplateName,
      to,
      vars: row.vars as Record<string, string | number | boolean>,
    });
    await db
      .update(notifications)
      .set({ status: "sent", attempts: row.attempts + 1, nextAttemptAt: null })
      .where(eq(notifications.id, row.id));
  } catch (e) {
    const attempts = row.attempts + 1;
    if (attempts >= NOTIFICATION_MAX_ATTEMPTS) {
      // Terminal: 5th failure -> failed + audit_log (FR-NOT-01.2).
      await db
        .update(notifications)
        .set({ status: "failed", attempts, lastError: String(e), nextAttemptAt: null })
        .where(eq(notifications.id, row.id));
      await db.insert(auditLog).values({
        actorId: null,
        actorRole: "system",
        action: "notification.failed",
        entity: "notifications",
        entityId: row.id,
        before: null,
        after: { template: row.template, channel: row.channel, attempts },
      });
      // FR-NOT-01.3 fallback: a WhatsApp send that failed permanently is
      // re-enqueued by EMAIL when the user has one. The email copy rides the
      // same machinery (queued row + outbox); an email template's own 5
      // failures escalate like any other — the fallback keys on whatsapp
      // only, so there is no recursive fallback.
      if (row.channel === "whatsapp" && user?.email) {
        await enqueueNotification(db, {
          userId: row.userId!,
          template: row.template as NotificationTemplateName,
          channel: "email",
          vars: row.vars as Record<string, string | number | boolean>,
        });
      }
      return;
    }
    // Still inside the ladder: record the attempt and back off (the BullMQ
    // native backoff drives the Redis path timing; next_attempt_at drives
    // the Redis-less floor).
    await db
      .update(notifications)
      .set({
        attempts,
        lastError: String(e),
        nextAttemptAt: new Date(Date.now() + (NOTIFICATION_BACKOFF_MS[attempts - 1] as number)),
      })
      .where(eq(notifications.id, row.id));
  }
}

export interface OutboxDispatchOptions extends DeliverNotificationOptions {
  /**
   * Redis path: hand each claimed row to a BullMQ `notification-send` job.
   * Omitted → inline floor delivery (Redis-less dev/test).
   */
  enqueue?: (data: NotificationJobData) => Promise<void>;
  /** Floor claim batch size (tests can shrink it); default 50. */
  limit?: number;
}

/**
 * One `outbox-dispatch` tick (SRS §8, every 5 s).
 *
 * STEP 1 — claim, atomically (the SRS idempotency mechanism): rows are
 * selected FOR UPDATE SKIP LOCKED and `dispatched_at` is set in THAT same
 * transaction, so concurrent dispatch ticks can never claim the same row
 * and a claimed row is never handed off twice.
 *
 * STEP 2 — post-claim handoff (never network inside the transaction): each
 * claimed row is enqueued to BullMQ (Redis path) or delivered inline by the
 * Redis-less floor. A BullMQ handoff failure resets `dispatched_at` so the
 * next tick retries it.
 */
export async function runOutboxDispatch(opts: OutboxDispatchOptions = {}): Promise<{ claimed: number }> {
  const claimed = await db.transaction(async (tx) => {
    const due = (await tx
      .select({ id: outboxEvents.id, payload: outboxEvents.payload })
      .from(outboxEvents)
      .where(and(eq(outboxEvents.type, "notification.send"), isNull(outboxEvents.dispatchedAt)))
      .limit(opts.limit ?? 50)
      .for("update", { skipLocked: true })) as Array<{ id: string; payload: unknown }>;
    if (due.length === 0) return [];
    await tx
      .update(outboxEvents)
      .set({ dispatchedAt: new Date() })
      .where(inArray(outboxEvents.id, due.map((r) => r.id)));
    return due;
  });

  for (const ev of claimed) {
    const payload = ev.payload as { notificationId?: string; to?: string | null };
    if (!payload?.notificationId) continue; // malformed row: claimed, dropped
    const data: NotificationJobData = { notificationId: payload.notificationId, to: payload.to ?? undefined };
    if (opts.enqueue) {
      try {
        await opts.enqueue(data);
      } catch {
        // Redis unavailable between claim and add: re-open the row; the next
        // tick retries the handoff (dispatched_at is the idempotency mark).
        await db.update(outboxEvents).set({ dispatchedAt: null }).where(eq(outboxEvents.id, ev.id));
      }
    } else {
      // Redis-less floor: inline delivery, best-effort per row (the audit +
      // failed bookkeeping already lives inside deliverNotification).
      await deliverNotification(data, opts);
    }
  }
  return { claimed: claimed.length };
}
