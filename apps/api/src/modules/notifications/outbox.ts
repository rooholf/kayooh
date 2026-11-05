/**
 * Transactional outbox helpers for FR-NOT-01.
 *
 * The outbox is the seam that guarantees "notification failure MUST NOT roll
 * back or block the business transaction" (FR-NOT-01.4): the business module
 * calls `enqueueNotification(tx, ...)` INSIDE its transaction, which writes
 * both a `notifications` row and an `outbox_events` row atomically with the
 * business data. The actual send happens later, asynchronously, through the
 * BullMQ `notification-send` queue (FR-NOT-01.2) — a provider failure only
 * marks the notification row `failed` and writes `audit_log`; it never touches
 * the committed business rows.
 *
 * Money is never involved here (notifications carry display vars only); the
 * deposit/payment top-up path stays bigint in its own module (INV-5).
 */
import { db, eq, users, type TxOrDb } from "@repo/db";
import { auditLog, notifications, outboxEvents } from "@repo/db";
import type { NotificationChannel, NotificationTemplateName } from "../../lib/types.js";
import { createNotificationProvider } from "../../lib/notifications.js";
import { loadEnv } from "../../lib/env.js";

export interface EnqueueNotificationInput {
  userId: string;
  template: NotificationTemplateName;
  channel: NotificationChannel;
  vars: Record<string, string | number | boolean>;
  /** Override for owner/admin routing; defaults to the template's channel. */
  to?: string;
}

/**
 * Inserts the `notifications` row + the matching `outbox_events` row in the
 * SAME transaction as the caller's business writes. Returns the notification
 * id. The send itself is deferred to the BullMQ worker; this function never
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

/** Backoff ladder for FR-NOT-01.2 (ms): up to 5 attempts, starting at 30 s. */
export const NOTIFICATION_BACKOFF_MS = [30_000, 60_000, 120_000, 240_000, 480_000] as const;
export const NOTIFICATION_MAX_ATTEMPTS = 5;

/**
 * Processes one notification delivery attempt. Runs in the BullMQ worker
 * process, AFTER the business transaction has committed. On permanent failure
 * (5th attempt) the row is marked `failed` and an `audit_log` entry is
 * written. A provider failure here can never throw back into a business
 * transaction.
 *
 * Architecture init: the delivery loop (load row + contact address, call
 * provider, retry classification, audit_log on terminal failure) is wired in
 * the jobs worker step; this signature is the contract.
 */
export async function deliverNotification(data: NotificationJobData): Promise<void> {
  const env = loadEnv();
  const provider = createNotificationProvider({ nodeEnv: env.nodeEnv, devLogOtp: env.devLogOtp });

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
  if (!to) return;

  try {
    await provider.send({
      channel: row.channel as NotificationChannel,
      template: row.template as NotificationTemplateName,
      to,
      vars: row.vars as Record<string, string | number | boolean>,
    });
    await db.update(notifications).set({ status: "sent", attempts: row.attempts + 1 }).where(eq(notifications.id, row.id));
  } catch (e) {
    const attempts = row.attempts + 1;
    if (attempts >= NOTIFICATION_MAX_ATTEMPTS) {
      await db.update(notifications).set({ status: "failed", attempts, lastError: String(e) }).where(eq(notifications.id, row.id));
      await db.insert(auditLog).values({
        actorId: null,
        actorRole: "system",
        action: "notification.failed",
        entity: "notifications",
        entityId: row.id,
        before: null,
        after: { template: row.template, channel: row.channel, attempts },
      });
    }
  }
}
