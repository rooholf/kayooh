/**
 * FR-PAY-02 payment webhook (SRS §6.5) plus the FR-PAY-03 refund leg it
 * triggers. Registered OUTSIDE `/api/v1` because the gateway calls it directly.
 *
 *   POST /webhooks/:gateway    (public; `fake` in P1, `xendit` after G-01)
 *
 * 1. Constant-time callback-token check (`verifyWebhook`). A mismatch is 401
 *    `WEBHOOK_SIGNATURE_INVALID` and NOTHING is stored.
 * 2. Insert the raw payload into `payment_webhook_events`; a duplicate
 *    `(provider, event_id)` returns 200 immediately (changes the DB once).
 * 3. Resolve the intent by `external_id` under `FOR UPDATE`. Already `paid` is
 *    a no-op.
 * 4. Amount check: `paid_amount` must equal `intent.amount_idr`, otherwise mark
 *    the event processed, alert the admin and change nothing.
 * 5. `PAID` booking (the 50% DP): `held` -> `confirmed`; `expired` -> re-run
 *    FR-INV-02 steps 1-2 under the lock -> `confirmed`, or refund the DP in
 *    full (`late_payment_sold_out`). Emit `reservation.confirmed` + notify.
 * 6. `PAID` late_fee -> intent `paid`.
 * 7. `EXPIRED`/`FAILED` -> intent `expired`/`failed` (the sweeper reclaims the
 *    hold; INV-2: the webhook never grants or releases capacity itself).
 * 8. Always 200 after commit; unexpected errors are 500 so the gateway retries.
 *
 * The gateway refund call (`settleRefund`) runs strictly AFTER the business
 * transaction commits (FR-PAY-03.2): the refund row is coalesced with the
 * webhook event inside the transaction, the network leg follows.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, sql } from "@repo/db";
import {
  db,
  outboxEvents,
  paymentIntents,
  paymentWebhookEvents,
  renters,
  reservations,
  type TxOrDb,
} from "@repo/db";
import { AppError, validationError } from "../../lib/errors.js";
import { recordAudit } from "../audit/index.js";
import { enqueueNotification } from "../notifications/index.js";
import { computeAvailability, type QueryExecutor } from "../inventory/index.js";
import { createPaymentGateway } from "./gateway.js";
import { recordRefund, settleRefund } from "./refunds.js";

const paramsSchema = z.object({ gateway: z.string().min(1) }).strict();

/** Post-commit outcome of one webhook delivery. */
type WebhookOutcome =
  | { kind: "duplicate" }
  | { kind: "processed" }
  | { kind: "refunded"; refundId: string }
  | { kind: "mismatch"; intentId: string; expectedIdr: bigint; receivedIdr: number };

/** INV-6: only `processed_at` may transition on a webhook event row. */
async function markProcessed(tx: TxOrDb, eventRowId: string): Promise<void> {
  await tx
    .update(paymentWebhookEvents)
    .set({ processedAt: sql`now()` as unknown as Date })
    .where(eq(paymentWebhookEvents.id, eventRowId));
}

/** FR-PAY-02.5: emit `reservation.confirmed` + the renter notification. */
async function emitReservationConfirmed(
  tx: TxOrDb,
  reservation: { id: string; renterId: string; outletId: string; category: string },
  intentId: string,
): Promise<void> {
  await tx.insert(outboxEvents).values({
    type: "reservation.confirmed",
    payload: {
      reservationId: reservation.id,
      renterId: reservation.renterId,
      outletId: reservation.outletId,
      category: reservation.category,
      intentId,
    },
  });
  const userId = (
    await tx
      .select({ userId: renters.userId })
      .from(renters)
      .where(eq(renters.id, reservation.renterId))
      .limit(1)
  )[0]?.userId;
  if (userId) {
    await enqueueNotification(tx, {
      userId,
      template: "reservation_confirmed",
      channel: "whatsapp",
      vars: { reservationId: reservation.id },
    });
  }
}

/**
 * FR-INV-02 steps 1-2 re-run for a late DP (SRS FR-PAY-02.5). Holds the SAME
 * `outlet_categories` FOR UPDATE lock the reservation path uses, then counts
 * committed capacity. Returns false when the row vanished (treat as sold out).
 */
async function hasCapacity(
  tx: TxOrDb,
  reservation: { outletId: string; category: string; startsAt: Date; endsAt: Date },
): Promise<boolean> {
  await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
  const lockRes = (await tx.execute(sql`
    SELECT safety_buffer FROM outlet_categories
    WHERE outlet_id = ${reservation.outletId} AND category = ${reservation.category}
    FOR UPDATE
  `)) as unknown as { rows: unknown[] };
  if (lockRes.rows.length === 0) return false;
  const available = await computeAvailability(tx as QueryExecutor, {
    outletId: reservation.outletId,
    category: reservation.category,
    startsAt: reservation.startsAt,
    endsAt: reservation.endsAt,
  });
  return available > 0;
}

async function handleEvent(
  tx: TxOrDb,
  event: { provider: string; eventId: string; type: "PAID" | "EXPIRED" | "FAILED"; externalId: string; paidAmount: number },
  raw: unknown,
): Promise<WebhookOutcome> {
  // ---- 2. dedupe: UNIQUE (provider, event_id) ----------------------------
  const inserted = await tx
    .insert(paymentWebhookEvents)
    .values({ provider: event.provider, eventId: event.eventId, raw: raw as Record<string, unknown> })
    .onConflictDoNothing()
    .returning({ id: paymentWebhookEvents.id });
  const eventRow = inserted[0];
  if (!eventRow) return { kind: "duplicate" };
  const eventRowId = eventRow.id;

  // ---- 3. resolve the intent under the row lock --------------------------
  const intent = (
    await tx.select().from(paymentIntents).where(eq(paymentIntents.id, event.externalId)).limit(1).for("update")
  )[0];
  if (!intent) {
    await markProcessed(tx, eventRowId);
    return { kind: "processed" };
  }
  if (intent.status === "paid") {
    // Already reconciled (replay) — no state change.
    await markProcessed(tx, eventRowId);
    return { kind: "processed" };
  }

  // ---- 4. amount check (only PAID carries money) -------------------------
  if (event.type === "PAID" && BigInt(event.paidAmount) !== intent.amountIdr) {
    await markProcessed(tx, eventRowId);
    return { kind: "mismatch", intentId: intent.id, expectedIdr: intent.amountIdr, receivedIdr: event.paidAmount };
  }

  // ---- 7. EXPIRED / FAILED ----------------------------------------------
  if (event.type === "EXPIRED" || event.type === "FAILED") {
    await tx
      .update(paymentIntents)
      .set({ status: event.type === "EXPIRED" ? "expired" : "failed" })
      .where(and(eq(paymentIntents.id, intent.id), sql`${paymentIntents.status} IN ('created','pending')`));
    await markProcessed(tx, eventRowId);
    return { kind: "processed" };
  }

  // ---- 6. PAID late_fee --------------------------------------------------
  if (intent.purpose === "late_fee") {
    await tx.update(paymentIntents).set({ status: "paid" }).where(eq(paymentIntents.id, intent.id));
    await markProcessed(tx, eventRowId);
    return { kind: "processed" };
  }

  // ---- 5. PAID booking (the 50% DP) --------------------------------------
  const reservationId = intent.reservationId;
  if (!reservationId) {
    await markProcessed(tx, eventRowId);
    return { kind: "processed" };
  }
  const reservation = (
    await tx.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1).for("update")
  )[0];
  if (!reservation) {
    await markProcessed(tx, eventRowId);
    return { kind: "processed" };
  }

  const roomLeft =
    reservation.status === "held" ? true : reservation.status === "expired" ? await hasCapacity(tx, reservation) : false;

  if (roomLeft) {
    await tx
      .update(reservations)
      .set({ status: "confirmed", confirmedAt: sql`now()` as unknown as Date })
      .where(eq(reservations.id, reservation.id));
    await tx.update(paymentIntents).set({ status: "paid" }).where(eq(paymentIntents.id, intent.id));
    await emitReservationConfirmed(tx, reservation, intent.id);
    await markProcessed(tx, eventRowId);
    return { kind: "processed" };
  }

  if (reservation.status === "expired") {
    // Paid after expiry with no capacity left: keep the money recorded then
    // refund the DP in full (`late_payment_sold_out`), strictly post-commit.
    await tx.update(paymentIntents).set({ status: "paid" }).where(eq(paymentIntents.id, intent.id));
    const recorded = await recordRefund(tx, {
      intentId: intent.id,
      amountIdr: intent.amountIdr,
      reason: "late_payment_sold_out",
      reservationId: reservation.id,
    });
    await markProcessed(tx, eventRowId);
    return { kind: "refunded", refundId: recorded.refundId };
  }

  // held but... cannot happen (roomLeft true above); defensive no-op.
  await markProcessed(tx, eventRowId);
  return { kind: "processed" };
}

export interface WebhookRouteOptions {
  nodeEnv: string;
  webhookSecret: string;
}

export function registerWebhookRoutes(app: FastifyInstance, options: WebhookRouteOptions): void {
  app.post("/webhooks/:gateway", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) throw validationError(params.error);

    let gateway;
    try {
      gateway = createPaymentGateway({ nodeEnv: options.nodeEnv, webhookSecret: options.webhookSecret });
    } catch {
      throw new AppError("GATEWAY_UNAVAILABLE", "Payment gateway is not configured.");
    }
    if (gateway.provider !== params.data.gateway) {
      throw new AppError("NOT_FOUND", "Unknown payment gateway.");
    }

    // ---- 1. signature (constant-time); mismatch -> 401, nothing stored ----
    const event = await gateway.verifyWebhook({ headers: request.headers, body: request.body });

    const outcome = await db.transaction((tx) => handleEvent(tx, event, request.body));

    if (outcome.kind === "refunded") {
      // FR-PAY-03.2: the gateway refund leg runs strictly after commit.
      await settleRefund(outcome.refundId);
    } else if (outcome.kind === "mismatch") {
      // FR-PAY-02.4: alert the admin (audit) — the amount did not match.
      await recordAudit({
        actorRole: "system",
        action: "payment.amount_mismatch",
        entity: "payment_intents",
        entityId: outcome.intentId,
        after: { expectedIdr: Number(outcome.expectedIdr), receivedIdr: outcome.receivedIdr },
      });
    }

    // ---- 8. always 200 after commit ---------------------------------------
    return reply.code(200).send({ status: outcome.kind });
  });
}
