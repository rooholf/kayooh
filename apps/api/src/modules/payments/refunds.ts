/**
 * FR-PAY-03 refunds (SRS §6.5).
 *
 *   issueRefund({intentId, amountIdr, reason, rentalId?}):
 *     1. insert the `pending` refund row with
 *        `amount_idr <= intent.amount_idr - already refunded` (else throw);
 *     2. call `gateway.refund` with idempotency key `refund-<refundId>`; on
 *        success `succeeded`, intent `refunded` when fully refunded; on
 *        failure `failed` + admin alert (retry only from the admin console);
 *     3. notify the renter (`refund_issued`) and emit outbox `refund.issued`
 *        (P2 ledger consumes it).
 *
 * The DB half (`recordRefund`) and the network half (`settleRefund`) are split
 * so callers that already hold a business transaction — e.g. the FR-PAY-02
 * webhook reconciling a late DP — can coalesce the refund row with their own
 * writes and still run the gateway call strictly AFTER commit.
 */
import { and, eq, sql } from "@repo/db";
import {
  db,
  outboxEvents,
  paymentIntents,
  refunds,
  renters,
  type TxOrDb,
} from "@repo/db";
import { AppError } from "../../lib/errors.js";
import { recordAudit } from "../audit/index.js";
import { enqueueNotification } from "../notifications/index.js";
import { createPaymentGateway, withGatewayTimeout, GATEWAY_TIMEOUT_MS } from "./gateway.js";

export type RefundReason = typeof refunds.$inferInsert.reason;
export type RefundStatus = typeof refunds.$inferSelect.status;

export interface IssueRefundInput {
  intentId: string;
  /** Integer rupiah (INV-5). */
  amountIdr: bigint;
  reason: RefundReason;
  reservationId?: string | null;
  rentalId?: string | null;
}

export interface RecordedRefund {
  refundId: string;
  amountIdr: bigint;
}

/**
 * FR-PAY-03 steps 1 & 3 (DB only — never a network call): validates the amount
 * against the intent, inserts the `pending` refund row, notifies the renter and
 * emits `refund.issued`. Runs inside the caller's transaction when one is
 * supplied, so the refund row commits atomically with the triggering decision.
 */
export async function recordRefund(tx: TxOrDb, input: IssueRefundInput): Promise<RecordedRefund> {
  const intentRows = await tx
    .select({
      id: paymentIntents.id,
      renterId: paymentIntents.renterId,
      amountIdr: paymentIntents.amountIdr,
    })
    .from(paymentIntents)
    .where(eq(paymentIntents.id, input.intentId))
    .limit(1);
  const intent = intentRows[0];
  if (!intent) throw new AppError("NOT_FOUND", "Payment intent does not exist.");
  if (input.amountIdr <= 0n) {
    throw new AppError("VALIDATION_ERROR", "Refund amount must be positive.");
  }

  // Already refunded = money already owed (pending) or already returned (succeeded).
  const refundedRes = (await tx.execute(sql`
    SELECT COALESCE(sum(amount_idr), 0)::text AS n FROM refunds
    WHERE payment_intent_id = ${input.intentId} AND status IN ('pending', 'succeeded')
  `)) as unknown as { rows: Array<{ n: string } | undefined> };
  const alreadyRefunded = BigInt(refundedRes.rows[0]?.n ?? "0");
  if (input.amountIdr > intent.amountIdr - alreadyRefunded) {
    throw new AppError("STATE_CONFLICT", "Refund exceeds the refundable amount.");
  }

  const inserted = await tx
    .insert(refunds)
    .values({
      paymentIntentId: input.intentId,
      reservationId: input.reservationId ?? null,
      rentalId: input.rentalId ?? null,
      amountIdr: input.amountIdr,
      reason: input.reason,
      status: "pending",
    })
    .returning({ id: refunds.id });
  const refundId = inserted[0]?.id;
  if (!refundId) throw new AppError("INTERNAL", "Refund insert returned no row.");

  // FR-PAY-03.3: notify the renter (same transaction as the refund row).
  const renterRows = await tx
    .select({ userId: renters.userId })
    .from(renters)
    .where(eq(renters.id, intent.renterId))
    .limit(1);
  const userId = renterRows[0]?.userId;
  if (userId) {
    await enqueueNotification(tx, {
      userId,
      template: "refund_issued",
      channel: "whatsapp",
      vars: { refundId, amountIdr: Number(input.amountIdr), reason: input.reason },
    });
  }

  // FR-PAY-03.3: outbox event for the P2 ledger (`refund_reversal`).
  await tx.insert(outboxEvents).values({
    type: "refund.issued",
    payload: {
      refundId,
      intentId: input.intentId,
      reservationId: input.reservationId ?? null,
      rentalId: input.rentalId ?? null,
      amountIdr: Number(input.amountIdr),
      reason: input.reason,
    },
  });

  return { refundId, amountIdr: input.amountIdr };
}

/**
 * FR-PAY-03 step 2: calls `gateway.refund` (idempotency key `refund-<refundId>`)
 * and settles the row. MUST run after the business transaction commits. A
 * gateway failure marks the row `failed`, alerts the admin (audit) and leaves
 * retries to the admin console.
 */
export async function settleRefund(refundId: string): Promise<RefundStatus> {
  const rows = await db.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
  const refund = rows[0];
  if (!refund) return "failed";
  if (refund.status !== "pending") return refund.status; // replayed settle — no-op

  const intentRows = await db
    .select({ id: paymentIntents.id, amountIdr: paymentIntents.amountIdr, gatewayRef: paymentIntents.gatewayRef })
    .from(paymentIntents)
    .where(eq(paymentIntents.id, refund.paymentIntentId))
    .limit(1);
  const intent = intentRows[0];
  if (!intent) return "failed";

  try {
    const gateway = createPaymentGateway({ nodeEnv: process.env.NODE_ENV ?? "development" });
    const result = await withGatewayTimeout(
      gateway.refund({
        idempotencyKey: `refund-${refundId}`,
        gatewayRef: intent.gatewayRef ?? `fixture-${intent.id}`,
        amount: Number(refund.amountIdr),
      }),
      GATEWAY_TIMEOUT_MS,
    );

    await db.transaction(async (tx) => {
      await tx
        .update(refunds)
        .set({ status: result.status, gatewayRef: result.gatewayRef })
        .where(and(eq(refunds.id, refundId), eq(refunds.status, "pending")));

      if (result.status === "succeeded") {
        // FR-PAY-03.2: intent `refunded` once fully refunded.
        const sumRes = (await tx.execute(sql`
          SELECT COALESCE(sum(amount_idr), 0)::text AS n FROM refunds
          WHERE payment_intent_id = ${refund.paymentIntentId} AND status = 'succeeded'
        `)) as unknown as { rows: Array<{ n: string } | undefined> };
        const refundedTotal = BigInt(sumRes.rows[0]?.n ?? "0");
        if (refundedTotal >= intent.amountIdr) {
          await tx.update(paymentIntents).set({ status: "refunded" }).where(eq(paymentIntents.id, intent.id));
        }
      }
    });

    if (result.status === "failed") {
      await recordAudit({
        actorRole: "system",
        action: "refund.failed",
        entity: "refunds",
        entityId: refundId,
        after: { reason: refund.reason, amountIdr: Number(refund.amountIdr) },
      });
    }
    return result.status;
  } catch (e) {
    await db.update(refunds).set({ status: "failed" }).where(and(eq(refunds.id, refundId), eq(refunds.status, "pending")));
    // FR-PAY-03.2: alert the admin; the console is the only retry path.
    await recordAudit({
      actorRole: "system",
      action: "refund.failed",
      entity: "refunds",
      entityId: refundId,
      after: { reason: refund.reason, amountIdr: Number(refund.amountIdr), error: String(e) },
    });
    return "failed";
  }
}

/**
 * Convenience entry point: records the refund in its own transaction, then
 * settles it against the gateway. Use this when no surrounding transaction
 * exists; callers already inside one use `recordRefund` + `settleRefund`.
 */
export async function issueRefund(input: IssueRefundInput): Promise<RecordedRefund & { status: RefundStatus }> {
  const recorded = await db.transaction((tx) => recordRefund(tx, input));
  const status = await settleRefund(recorded.refundId);
  return { ...recorded, status };
}
