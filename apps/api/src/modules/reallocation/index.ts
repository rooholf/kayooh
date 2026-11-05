/**
 * FR-INV-04 — block a bike and reallocate.
 *
 * Trigger (staff incident `bike_missing` / `bike_damaged`): the bike's state
 * change leaves overlapping confirmed reservations over-committed. This module
 * owns the FR-INV-04 steps 2-6: at_risk marking + deadline, reallocation
 * alternatives, accept (new `confirmed` reservation with COPIED pricing and NO
 * new payment intent, A-06), and decline (cancel + full refund
 * `reallocation_declined`).
 */
import { and, eq, sql } from "@repo/db";
import {
  notifications,
  outletCategories,
  outlets,
  paymentIntents,
  refunds,
  renters,
  reservations,
  type Database,
  type TxOrDb,
} from "@repo/db";
import type { CreateReservationResponse } from "@repo/contracts";
import { AppError } from "../../lib/errors.js";
import { getConfig } from "../app-config/index.js";
import {
  computeAvailability,
  countCommittedRentals,
  countCommittedReservations,
  countInService,
  type AvailabilityInput,
  type QueryExecutor,
} from "../inventory/index.js";

const toDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value));

/* ------------------------------------------------------------------ */
/* FR-INV-04.2: at_risk marking + deadline + renter notifications       */
/* ------------------------------------------------------------------ */

/**
 * Marks the overlapping `confirmed` reservation(s) of the bike's
 * `(homeOutlet, category)` suffering from a capacity drop. Loops through the
 * windows where committed > inService - buffer, newest `created_at` first; each
 * marked reservation stops counting, so the loop ends when the remaining
 * confirmed reservations fit again.
 *
 * Deadline: `min(now + reallocation.response_minutes, starts_at)`; windows
 * that already started are NOT touched.
 */
export async function flagReallocationCandidates(
  db: Database | TxOrDb,
  outletId: string,
  category: string,
  now: Date,
): Promise<string[]> {
  const marked: string[] = [];
  const bufRows = await db
    .select({ safetyBuffer: outletCategories.safetyBuffer })
    .from(outletCategories)
    .where(and(eq(outletCategories.outletId, outletId), eq(outletCategories.category, category)))
    .limit(1);
  const buffer = Number(bufRows[0]?.safetyBuffer ?? 0);
  const offerMinutes = await getConfig("reallocation.response_minutes");
  const graceSeconds = (await getConfig("noshow.grace_minutes")) * 60;

  for (;;) {
    // Newest-created confirmed, not-yet-flagged reservation for a FUTURE window.
    const candRows = (await db.execute(sql`
      SELECT r.id, r.starts_at
      FROM reservations r
      WHERE r.outlet_id = ${outletId}
        AND r.category = ${category}
        AND r.status = 'confirmed'
        AND r.at_risk = false
        AND r.starts_at > ${now}
      ORDER BY r.created_at DESC
      LIMIT 1
    `)) as unknown as { rows: Array<{ id: string; starts_at: Date | string } | undefined> };
    const cand = candRows.rows[0];
    if (!cand) break;

    const startsAt = toDate(cand.starts_at);
    const exclusive = {
      outletId,
      category,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60_000),
      excludeReservationId: cand.id,
    };
    const committed =
      (await countCommittedReservations(db as QueryExecutor, exclusive, graceSeconds)) +
      (await countCommittedRentals(db as QueryExecutor, exclusive));
    const inService = await countInService(db as QueryExecutor, { outletId, category, startsAt, endsAt: startsAt });
    if (committed <= inService - buffer) break;

    await db.execute(sql`
      UPDATE reservations
      SET at_risk = true,
          reallocation_deadline_at = least(now() + make_interval(mins => ${offerMinutes}), starts_at)
      WHERE id = ${cand.id}
    `);

    // Step 3: notify the affected renter (reallocation_offer).
    const renterRows = (await db.execute(sql`
      SELECT ru.id AS user_id
      FROM reservations r
      JOIN renters ren ON ren.id = r.renter_id
      JOIN users ru ON ru.id = ren.user_id
      WHERE r.id = ${cand.id}
    `)) as unknown as { rows: Array<{ user_id: string } | undefined> };
    const userId = renterRows.rows[0]?.user_id;
    if (userId) {
      await db.insert(notifications).values({
        userId,
        channel: "whatsapp",
        template: "reallocation_offer",
        vars: { reservationId: cand.id },
        status: "queued",
      });
    }
    marked.push(cand.id);
  }
  return marked;
}

/* ------------------------------------------------------------------ */
/* FR-INV-04.4 alternatives                                            */
/* ------------------------------------------------------------------ */

export interface Alternative {
  outletId: string;
  outletName: string;
  availableNow: number;
}

/**
 * Outlets (any owner) with at least one available bike for the same category
 * and window, computed live via computeAvailability (FR-INV-04.4).
 */
export async function listAlternatives(
  db: Database,
  windows: { startsAt: Date; endsAt: Date },
  category: string,
  excludeOutletId: string,
): Promise<Alternative[]> {
  const offeringRows = await db
    .select({ outletId: outletCategories.outletId, name: outlets.name, active: outletCategories.active })
    .from(outletCategories)
    .innerJoin(outlets, eq(outlets.id, outletCategories.outletId))
    .where(
      and(eq(outletCategories.category, category), eq(outletCategories.active, true), eq(outlets.status, "active")),
    );
  const alternatives: Alternative[] = [];
  for (const row of offeringRows) {
    if (row.outletId === excludeOutletId) continue;
    const input: AvailabilityInput = { outletId: row.outletId, category, startsAt: windows.startsAt, endsAt: windows.endsAt };
    const available = await computeAvailability(db, input);
    if (available >= 1) {
      alternatives.push({ outletId: row.outletId, outletName: row.name, availableNow: available });
    }
  }
  return alternatives;
}

/* ------------------------------------------------------------------ */
/* FR-INV-04.5 accept                                                  */
/* ------------------------------------------------------------------ */

async function reservationResource(row: typeof reservations.$inferSelect) {
  const iso = (d: Date): string => d.toISOString();
  const idr = (v: bigint): number => Number(v);
  return {
    id: row.id,
    outletId: row.outletId,
    category: row.category,
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    status: row.status as "held" | "confirmed" | "fulfilled" | "cancelled",
    expiresAt: row.expiresAt === null ? null : iso(row.expiresAt),
    priceIdr: idr(row.priceIdr),
    discountIdr: idr(row.discountIdr),
    finalIdr: idr(row.finalIdr),
    atRisk: row.atRisk,
  };
}

/**
 * Accept the reallocation offer: run the FR-INV-02 lock at the target outlet
 * (skipping the payment legs), insert the NEW `confirmed` reservation with
 * COPIED price fields and rate_snapshot (A-06) and cancel the original
 * (`cancel_reason = 'reallocated'`). NO new payment intent is written.
 */
export async function acceptReallocation(
  db: Database,
  reservationId: string,
  targetOutletId: string,
): Promise<CreateReservationResponse> {
  const nowDate = new Date();
  return db.transaction(async (tx) => {
    // Pre-checks (uncharged reads before the lock).
    const resRows = await tx.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
    const original = resRows[0];
    if (!original) throw new AppError("NOT_FOUND", "Reservation does not exist.");

    const renterUserRows = await tx
      .select({ userId: renters.userId })
      .from(renters)
      .where(eq(renters.id, original.renterId))
      .limit(1);
    const renterUserId = renterUserRows[0]?.userId;
    if (!renterUserId) throw new AppError("STATE_CONFLICT", "Renter profile missing for this reservation.");

    if (original.status !== "confirmed") {
      throw new AppError("STATE_CONFLICT", "Reallocation requires a confirmed reservation.");
    }

    // Target outlet + offering must be active.
    const outletRows = await tx
      .select({ id: outlets.id, ownerId: outlets.ownerId, status: outlets.status })
      .from(outlets)
      .where(eq(outlets.id, targetOutletId))
      .limit(1);
    const targetOutlet = outletRows[0];
    if (!targetOutlet || targetOutlet.status !== "active") {
      throw new AppError("NOT_FOUND", "Target outlet does not exist or is inactive.");
    }
    const offeringRows = await tx
      .select({ active: outletCategories.active })
      .from(outletCategories)
      .where(and(eq(outletCategories.outletId, targetOutletId), eq(outletCategories.category, original.category)))
      .limit(1);
    if (!offeringRows[0] || !offeringRows[0].active) {
      throw new AppError("CATEGORY_NOT_OFFERED", "This category is not offered at the target outlet.");
    }

    // FR-INV-02 lock, then capacity re-check (no SOLD_OUT guessing).
    await tx.execute(sql`
      SELECT safety_buffer FROM outlet_categories
      WHERE outlet_id = ${targetOutletId} AND category = ${original.category}
      FOR UPDATE
    `);
    const available = await computeAvailability(tx as QueryExecutor, {
      outletId: targetOutletId,
      category: original.category,
      startsAt: original.startsAt,
      endsAt: original.endsAt,
    });
    if (available < 1) throw new AppError("SOLD_OUT", "No bikes available for this window at the target outlet.");

    // The new reservation: prices + rate_snapshot copied; status confirmed
    // directly (A-06: no new payment is created for a reallocation).
    const inserted = await tx
      .insert(reservations)
      .values({
        renterId: original.renterId,
        outletId: targetOutletId,
        ownerId: targetOutlet.ownerId,
        category: original.category,
        startsAt: original.startsAt,
        endsAt: original.endsAt,
        status: "confirmed",
        expiresAt: null,
        confirmedAt: nowDate,
        priceIdr: original.priceIdr,
        discountIdr: original.discountIdr,
        finalIdr: original.finalIdr,
        promoId: null,
        ownerPromoBps: 0,
        rateSnapshot: original.rateSnapshot,
      })
      .returning();
    const created = inserted[0];
    if (!created) throw new AppError("INTERNAL", "Reservation insert returned no row");

    await tx
      .update(reservations)
      .set({ status: "cancelled", cancelReason: "reallocated" })
      .where(and(eq(reservations.id, reservationId), eq(reservations.status, "confirmed")));

    const resource = await reservationResource(created);
    return {
      reservation: { ...resource, atRisk: false, status: "confirmed" as const },
      price: {
        priceIdr: resource.priceIdr,
        discountIdr: resource.discountIdr,
        finalIdr: resource.finalIdr,
      },
    };
  });
}

/* ------------------------------------------------------------------ */
/* FR-INV-04.6 decline                                                 */
/* ------------------------------------------------------------------ */

/**
 * Decline the reallocation offer (or let the sweeper fire on the deadline):
 * cancel the reservation and record the full refund with reason
 * `reallocation_declined` (FR-PAY-02 path executes the gateway later).
 */
export async function declineReallocation(db: Database, reservationId: string): Promise<{ reservationId: string }> {
  const cancelledRows = (await db.execute(sql`
    UPDATE reservations
    SET status = 'cancelled', cancel_reason = 'reallocation_declined'
    WHERE id = ${reservationId}::uuid AND status = 'confirmed' AND at_risk = true
    RETURNING id, final_idr
  `)) as unknown as { rows: Array<{ id: string; final_idr: string | number } | undefined> };
  const cancelled = cancelledRows.rows[0];
  if (!cancelled) {
    // Already cancelled (replayed decline) — do not double-refund (guarded UPDATE).
    return { reservationId };
  }
  const intentRows = await db
    .select({ id: paymentIntents.id })
    .from(paymentIntents)
    .where(and(eq(paymentIntents.reservationId, reservationId), eq(paymentIntents.purpose, "booking")))
    .limit(1);
  const intent = intentRows[0];
  if (intent && Number(cancelled.final_idr) > 0) {
    await db.insert(refunds).values({
      paymentIntentId: intent.id,
      reservationId,
      amountIdr: BigInt(cancelled.final_idr),
      reason: "reallocation_declined",
      status: "pending",
    });
  }
  return { reservationId };
}
