/**
 * quote() (FR-PRC-01): rate lookup + integer-rupiah math (INV-5).
 *   units   = ceil(durationMinutes / pricing.billing_unit_minutes)
 *   price   = rateIdr * units
 *   final   = price - discount   (discount always 0 in P1)
 * Promo handling per P1: any supplied promoCode is 422 PROMO_INVALID (the
 * promotions engine arrives P2 — FR-PRC-01.3).
 *
 * `amount` stays integer math on JS numbers; every value involved is an
 * integer and far below 2^53 (1e9 rate cap × ≤168 billable units), so no
 * floating-point drift can occur (INV-5: no floats in money — these are
 * integer ops on at most ~1e11-valued integers).
 */
import { sql, type TxOrDb } from "@repo/db";
import { getConfig } from "../app-config/index.js";
import { AppError } from "../../lib/errors.js";

export interface QuoteInput {
  outletId: string;
  category: string;
  startsAt: Date;
  endsAt: Date;
  promoCode?: string;
}

export interface QuoteResult {
  priceIdr: number;
  discountIdr: number;
  finalIdr: number;
  /** Snapshot data for the reservation row. */
  rateIdr: number;
  unitMinutes: number;
  promoId: null;
  ownerPromoBps: number;
}

export function computeUnits(durationMinutes: number, unitMinutes: number): number {
  return Math.ceil(durationMinutes / unitMinutes);
}

export async function quote(
  exec: TxOrDb,
  input: QuoteInput,
): Promise<QuoteResult> {
  // P1: promotions not implemented (FR-PRC-01.3) — explicit rejection so the
  // client cannot assume the code was applied.
  if (input.promoCode !== undefined) {
    throw new AppError("PROMO_INVALID", "Promotion codes are not accepted yet.");
  }

  const [unitMinutes, minChargeIdr] = await Promise.all([
    getConfig("pricing.billing_unit_minutes"),
    getConfig("payments.min_charge_idr"),
  ]);

  // Rate precedence (FR-PRC-01.1): outlet-specific latest <= now(), else
  // the global (outlet_id IS NULL) latest <= now(); none -> CATEGORY_NOT_OFFERED.
  const rateRes = (await exec.execute(sql`
    SELECT rate_idr FROM pricing_rules
    WHERE category = ${input.category}
      AND effective_from <= now()
      AND (outlet_id = ${input.outletId} OR outlet_id IS NULL)
    ORDER BY (outlet_id = ${input.outletId}) DESC, effective_from DESC
    LIMIT 1
  `)) as unknown as { rows: Array<{ rate_idr: string | number } | undefined> };
  const rateRow = rateRes.rows[0];
  if (!rateRow) {
    throw new AppError("CATEGORY_NOT_OFFERED", "No pricing rule for this outlet/category.");
  }
  const rateIdr = Number(rateRow.rate_idr);
  if (!Number.isInteger(rateIdr) || rateIdr <= 0) {
    throw new AppError("CATEGORY_NOT_OFFERED", "Pricing rule is invalid.");
  }

  const durationMinutes = Math.round(
    (input.endsAt.getTime() - input.startsAt.getTime()) / 60_000,
  );
  const units = computeUnits(durationMinutes, unitMinutes);
  const priceIdr = rateIdr * units;
  const discountIdr = 0;
  const finalIdr = priceIdr - discountIdr;

  // FR-PRC-01.5: a positive-but-sunken charge would never be collectable.
  if (finalIdr > 0 && finalIdr < minChargeIdr) {
    throw new AppError("AMOUNT_BELOW_MINIMUM", "Charged amount is below the minimum charge.");
  }

  return {
    priceIdr,
    discountIdr,
    finalIdr,
    rateIdr,
    unitMinutes,
    promoId: null,
    ownerPromoBps: 0,
  };
}
