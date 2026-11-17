import { randomUUID } from "node:crypto";
import { and, eq, sql } from "@repo/db";
import {
  db,
  ledgerEntries,
  owners,
  rentals,
  reservations,
  type TxOrDb,
} from "@repo/db";
import { getConfig } from "../app-config/index.js";
import { getCommissionRule } from "./rules.js";
import { roundHalfUp, floor } from "./money.js";

export function weekKeyOf(date: Date = new Date()): string {
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function toExec(args: unknown[]): { primary: unknown; exec: TxOrDb } {
  if (typeof args[0] === "string") {
    return { primary: args[0], exec: (args[1] ?? db) as TxOrDb };
  }
  // first arg may be exec/db
  if (args[0] && typeof (args[0] as { select?: unknown }).select === "function") {
    return { primary: args[1], exec: args[0] as TxOrDb };
  }
  return { primary: args[0], exec: (args[1] ?? db) as TxOrDb };
}

async function runInTx<T>(exec: TxOrDb, fn: (tx: TxOrDb) => Promise<T>): Promise<T> {
  if (exec === db) {
    return db.transaction(fn) as Promise<T>;
  }
  return fn(exec);
}

export async function postRentalCompletion(...args: unknown[]): Promise<{ groupId: string; inserted: boolean }> {
  const { primary: rentalId, exec } = toExec(args);
  const rid = String(rentalId);

  return runInTx(exec, async (tx: TxOrDb) => {
    const rentalRows = await tx.select().from(rentals).where(eq(rentals.id, rid)).limit(1);
    const rental = rentalRows[0];
    if (!rental) {
      throw new Error(`rental not found: ${rid}`);
    }

    const existing = await tx
      .select({ id: ledgerEntries.id, groupId: ledgerEntries.groupId })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.rentalId, rid))
      .limit(1);
    if (existing.length > 0) {
      return { groupId: existing[0]!.groupId, inserted: false };
    }

    const reservationRows = await tx.select().from(reservations).where(eq(reservations.id, rental.reservationId)).limit(1);
    const reservation = reservationRows[0];
    if (!reservation) throw new Error(`reservation not found for rental ${rid}`);

    const ownerRows = await tx.select().from(owners).where(eq(owners.id, rental.ownerId)).limit(1);
    const owner = ownerRows[0];

    const rule = await getCommissionRule(tx, rental.ownerId, new Date());
    const P = reservation.priceIdr as bigint;
    const D = reservation.discountIdr as bigint;
    const base = rule.base === "post_discount" ? P - D : P;
    const commission = -roundHalfUp(base * BigInt(rule.rateBps), 10000n);

    const groupId = randomUUID();
    const postingTime = new Date();
    const weekKey = weekKeyOf(postingTime);
    const outletId = rental.checkoutOutletId ?? reservation.outletId;

    const entries: Record<string, unknown>[] = [];
    entries.push({
      ownerId: rental.ownerId,
      outletId,
      rentalId: rid,
      type: "rental_revenue",
      amountIdr: P,
      groupId,
      weekKey,
      ref: null,
    });
    entries.push({
      ownerId: rental.ownerId,
      outletId,
      rentalId: rid,
      type: "platform_commission",
      amountIdr: commission,
      groupId,
      weekKey,
      ref: null,
    });

    const optedOut = owner?.promoOptOut === true;
    if (D > 0n && !optedOut) {
      const promoAmount = -floor(D * BigInt(reservation.ownerPromoBps), 10000n);
      if (promoAmount !== 0n) {
        entries.push({
          ownerId: rental.ownerId,
          outletId,
          rentalId: rid,
          type: "promo_share",
          amountIdr: promoAmount,
          groupId,
          weekKey,
          ref: null,
        });
      }
    }

    const lateFee = (rental.lateFeeIdr ?? 0n) as bigint;
    if (lateFee > 0n) {
      const lateShareBps = await getConfig("late.owner_share_bps");
      const lateAmount = floor(lateFee * BigInt(lateShareBps), 10000n);
      if (lateAmount !== 0n) {
        entries.push({
          ownerId: rental.ownerId,
          outletId,
          rentalId: rid,
          type: "late_fee_share",
          amountIdr: lateAmount,
          groupId,
          weekKey,
          ref: null,
        });
      }
    }

    // succeeded refunds linked to rental
    const refundRes = (await tx.execute(sql`
      SELECT COALESCE(SUM(amount_idr), 0)::text AS n FROM refunds
      WHERE rental_id = ${rid} AND status = 'succeeded'
    `)) as unknown as { rows: Array<{ n: string } | undefined> };
    const refundedTotal = BigInt(refundRes.rows?.[0]?.n ?? "0");
    if (refundedTotal > 0n) {
      entries.push({
        ownerId: rental.ownerId,
        outletId,
        rentalId: rid,
        type: "refund_reversal",
        amountIdr: -refundedTotal,
        groupId,
        weekKey,
        ref: null,
      });
    } else if (rental.mechanicalFailure === true) {
      // Mechanical failure: full price refunded even without a persisted refund row.
      entries.push({
        ownerId: rental.ownerId,
        outletId,
        rentalId: rid,
        type: "refund_reversal",
        amountIdr: -P,
        groupId,
        weekKey,
        ref: null,
      });
    }

    await tx.insert(ledgerEntries).values(entries as never);
    return { groupId, inserted: true };
  });
}

// Aliases for idempotent posting.
export const postRentalLedger = postRentalCompletion;
export const postLedgerForRental = postRentalCompletion;
export const handleRentalCompleted = postRentalCompletion;

export async function postRefundReversal(...args: unknown[]): Promise<{ groupId: string | null; inserted: boolean }> {
  // Flexible signature: (rentalId, amountIdr, refundId?, exec?) OR (exec, rentalId, amountIdr, refundId?)
  let rentalId: string;
  let amountIdr: bigint;
  let refundId: string | null = null;
  let exec: TxOrDb = db;
  if (typeof args[0] === "string") {
    rentalId = args[0];
    amountIdr = typeof args[1] === "bigint" ? (args[1] as bigint) : BigInt(String(args[1]));
    refundId = (args[2] as string | null) ?? null;
    exec = (args[3] ?? db) as TxOrDb;
  } else if (args[0] && typeof (args[0] as { select?: unknown }).select === "function") {
    exec = args[0] as TxOrDb;
    rentalId = String(args[1]);
    amountIdr = typeof args[2] === "bigint" ? (args[2] as bigint) : BigInt(String(args[2]));
    refundId = (args[3] as string | null) ?? null;
  } else {
    rentalId = String(args[0]);
    amountIdr = typeof args[1] === "bigint" ? (args[1] as bigint) : BigInt(String(args[1]));
    refundId = (args[2] as string | null) ?? null;
    exec = (args[3] ?? db) as TxOrDb;
  }

  const rid = String(rentalId);
  return runInTx(exec, async (tx: TxOrDb) => {
    const existing = await tx
      .select({ id: ledgerEntries.id, groupId: ledgerEntries.groupId })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.rentalId, rid), eq(ledgerEntries.type, "refund_reversal")))
      .limit(1);
    if (existing.length > 0) {
      return { groupId: existing[0]!.groupId, inserted: false };
    }

    const rentalRows = await tx.select().from(rentals).where(eq(rentals.id, rid)).limit(1);
    const rental = rentalRows[0];
    if (!rental) throw new Error(`rental not found: ${rid}`);
    const reservationRows = await tx.select().from(reservations).where(eq(reservations.id, rental.reservationId)).limit(1);
    const reservation = reservationRows[0];

    const groupId = randomUUID();
    const weekKey = weekKeyOf(new Date());
    const outletId = rental.checkoutOutletId ?? reservation?.outletId;
    await tx.insert(ledgerEntries).values({
      ownerId: rental.ownerId,
      outletId,
      rentalId: rid,
      type: "refund_reversal",
      amountIdr: -amountIdr,
      groupId,
      weekKey,
      ref: refundId,
    });
    return { groupId, inserted: true };
  });
}

export async function postDamageClaimCredit(...args: unknown[]): Promise<{ groupId: string; inserted: boolean }> {
  // Accept (input, exec?) or (exec, input)
  let input: unknown;
  let exec: TxOrDb = db;
  if (args[0] && typeof (args[0] as { select?: unknown }).select === "function") {
    exec = args[0] as TxOrDb;
    input = args[1];
  } else {
    input = args[0];
    exec = (args[1] ?? db) as TxOrDb;
  }
  const inp = (input ?? {}) as Record<string, unknown>;
  return runInTx(exec, async (tx: TxOrDb) => {
    const ownerId = inp.ownerId as string;
    const amount = typeof inp.amount === "bigint" ? (inp.amount as bigint) : BigInt(String(inp.amount ?? inp.amountIdr ?? 0));
    const claimsShareBps = await getConfig("claims.owner_share_bps");
    const credit = floor(amount * BigInt(claimsShareBps), 10000n);
    const groupId = randomUUID();
    const weekKey = weekKeyOf(new Date());
    await tx.insert(ledgerEntries).values({
      ownerId: ownerId as string,
      outletId: (inp.outletId ?? null) as string | null,
      rentalId: (inp.rentalId ?? null) as string | null,
      type: "damage_claim_credit",
      amountIdr: credit,
      groupId,
      weekKey,
      ref: (inp.ref ?? null) as string | null,
    });
    return { groupId, inserted: true };
  });
}

export async function postManualAdjustment(...args: unknown[]): Promise<{ groupId: string; inserted: boolean }> {
  let input: unknown;
  let exec: TxOrDb = db;
  if (args[0] && typeof (args[0] as { select?: unknown }).select === "function") {
    exec = args[0] as TxOrDb;
    input = args[1];
  } else {
    input = args[0];
    exec = (args[1] ?? db) as TxOrDb;
  }
  const inp = (input ?? {}) as Record<string, unknown>;
  return runInTx(exec, async (tx: TxOrDb) => {
    const amount = typeof inp.amountIdr === "bigint" ? (inp.amountIdr as bigint) : BigInt(String(inp.amountIdr ?? inp.amount ?? 0));
    const groupId = randomUUID();
    const weekKey = weekKeyOf(new Date());
    await tx.insert(ledgerEntries).values({
      ownerId: inp.ownerId as string,
      outletId: (inp.outletId ?? null) as string | null,
      rentalId: (inp.rentalId ?? null) as string | null,
      type: "manual_adjustment",
      amountIdr: amount,
      groupId,
      weekKey,
      ref: (inp.ref ?? null) as string | null,
    });
    return { groupId, inserted: true };
  });
}

export const consumeRentalCompleted = handleRentalCompleted;
export const consumeRefundIssued = postRefundReversal;
