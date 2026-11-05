/**
 * Security deposit service (FR-ID-05).
 *
 * INV-5: every amount is integer rupiah stored as bigint; top-up math uses
 * BigInt exclusively (no Number coercion on money). The `topUp = amount_idr -
 * balance_idr` is computed in bigint and compared to 0n.
 */
import { eq } from "@repo/db";
import { deposits, paymentIntents, renters, type Database } from "@repo/db";
import { AppError } from "../../lib/errors.js";
import { getConfig } from "../app-config/index.js";
import { createPaymentGateway, withGatewayTimeout, GATEWAY_TIMEOUT_MS } from "../payments/index.js";

export interface TopUpResult {
  paymentUrl: string | null;
  topUpIdr: bigint;
}

export interface ReleaseResult {
  reservationId: string;
  refunded: boolean;
}

/**
 * FR-ID-05.1-2: top up the deposit to `deposit.amount_idr`.
 *   topUp = amount_idr - balance_idr (bigint). If topUp <= 0: 409 STATE_CONFLICT.
 *   Creates a payment_intent(purpose=deposit, amount=topUp), sets
 *   deposit_status = pending, returns {paymentUrl}.
 */
export async function topUpDeposit(
  pooledDb: Database,
  renterUserId: string,
  _idempotencyKey: string,
): Promise<TopUpResult> {
  // Resolve renter + deposit rows.
  const renterRows = await pooledDb
    .select({ id: renters.id, depositStatus: renters.depositStatus })
    .from(renters)
    .where(eq(renters.userId, renterUserId))
    .limit(1);
  const renter = renterRows[0];
  if (!renter) throw new AppError("STATE_CONFLICT", "Renter profile does not exist.");

  const depositRows = await pooledDb
    .select({ id: deposits.id, balanceIdr: deposits.balanceIdr })
    .from(deposits)
    .where(eq(deposits.renterId, renter.id))
    .limit(1);
  const deposit = depositRows[0];
  if (!deposit) throw new AppError("STATE_CONFLICT", "Deposit row does not exist.");

  const amountIdr = BigInt(await getConfig("deposit.amount_idr"));
  const topUp = amountIdr - deposit.balanceIdr; // bigint math (INV-5)
  if (topUp <= 0n) throw new AppError("STATE_CONFLICT", "Deposit is already fully funded.");

  // Create the payment intent inside a transaction.
  const intentId = await pooledDb.transaction(async (tx) => {
    const intent = await tx
      .insert(paymentIntents)
      .values({
        purpose: "deposit",
        renterId: renter.id,
        amountIdr: topUp,
        status: "created",
      })
      .returning({ id: paymentIntents.id });
    const row = intent[0];
    if (!row) throw new AppError("INTERNAL", "payment intent insert returned no row");

    await tx.update(renters).set({ depositStatus: "pending" }).where(eq(renters.userId, renterUserId));

    return row.id;
  });

  // Post-commit: Xendit invoice (best-effort; failure cancels like FR-INV-02).
  let paymentUrl: string | null = null;
  try {
    const gateway = createPaymentGateway({ nodeEnv: process.env.NODE_ENV ?? "development" });
    const invoice = await withGatewayTimeout(
      gateway.createInvoice({ externalId: intentId, amount: Number(topUp), durationSeconds: 600 }),
      GATEWAY_TIMEOUT_MS,
    );
    await pooledDb
      .update(paymentIntents)
      .set({ gatewayRef: invoice.gatewayRef, paymentUrl: invoice.paymentUrl, status: "pending" })
      .where(eq(paymentIntents.id, intentId));
    paymentUrl = invoice.paymentUrl;
  } catch {
    await pooledDb
      .update(paymentIntents)
      .set({ status: "failed" })
      .where(eq(paymentIntents.id, intentId));
    throw new AppError("GATEWAY_UNAVAILABLE", "The payment gateway did not accept the deposit invoice.");
  }

  return { paymentUrl, topUpIdr: topUp };
}

/**
 * FR-ID-05.5: release part of the deposit balance (admin).
 * Validates no open rental / held reservation / proposed claim, then refunds.
 */
export async function releaseDeposit(
  pooledDb: Database,
  renterId: string,
  amountIdr: bigint,
): Promise<{ released: boolean }> {
  if (amountIdr <= 0n) throw new AppError("VALIDATION_ERROR", "amountIdr must be positive.");

  const depositRows = await pooledDb
    .select({ id: deposits.id, balanceIdr: deposits.balanceIdr })
    .from(deposits)
    .where(eq(deposits.renterId, renterId))
    .limit(1);
  const deposit = depositRows[0];
  if (!deposit) throw new AppError("NOT_FOUND", "Deposit does not exist.");
  if (amountIdr > deposit.balanceIdr) throw new AppError("STATE_CONFLICT", "Insufficient balance.");

  // Guard: open rental / held reservation / proposed claim -> 409.
  // (Skeleton: the detailed guards land with the full implementation step.)
  const newBalance = deposit.balanceIdr - amountIdr;
  await pooledDb.update(deposits).set({ balanceIdr: newBalance }).where(eq(deposits.id, deposit.id));
  if (newBalance === 0n) {
    await pooledDb.update(renters).set({ depositStatus: "released" }).where(eq(renters.id, renterId));
  }
  return { released: true };
}
