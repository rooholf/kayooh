/**
 * Staff outlet reads (SRS 7.2 — plan C.2.2, issue #41).
 *
 * Every query is scoped to the staff user's outlet (FR-ID-02.4): the staff
 * principal carries `outletId`, and each read filters on it — a JMB-001
 * staff sees only JMB-001.
 *
 *   GET /staff/outlet/bikes     — bikes currently at the outlet, filter
 *                                 state/category, cursor pagination.
 *   GET /staff/outlet/expected  — reservations starting a WIB day (masked).
 *   GET /staff/outlet/overdue   — open rentals past expected_end_at with
 *                                 escalationStage.
 */
import { and, asc, eq, gt, sql } from "@repo/db";
import {
  bikes,
  db,
  rentals,
  renters,
  reservations,
  users,
} from "@repo/db";
import { maskPhone } from "../../lib/mask.js";

/** WIB = UTC+7; a `YYYY-MM-DD` date is the WIB calendar day. */
export function wibDayBounds(date: string): { start: Date; end: Date } {
  const OFFSET_MS = 7 * 60 * 60 * 1000;
  const startWib = Date.parse(`${date}T00:00:00Z`);
  return {
    start: new Date(startWib - OFFSET_MS),
    end: new Date(startWib - OFFSET_MS + 24 * 60 * 60 * 1000),
  };
}

export interface StaffBikeItem {
  bikeId: string;
  assetTag: string;
  category: string;
  state: string;
}

export async function listOutletBikes(
  outletId: string,
  query: { state?: string; category?: string; limit: number; cursor?: string },
): Promise<{ items: StaffBikeItem[]; nextCursor: string | null }> {
  const conditions = [eq(bikes.currentOutletId, outletId)];
  if (query.state) {
    conditions.push(eq(bikes.state, query.state as (typeof bikes.$inferSelect)["state"]));
  }
  if (query.category) conditions.push(eq(bikes.category, query.category));
  if (query.cursor) conditions.push(gt(bikes.id, query.cursor));

  const rows = await db
    .select({
      bikeId: bikes.id,
      assetTag: bikes.assetTag,
      category: bikes.category,
      state: bikes.state,
    })
    .from(bikes)
    .where(and(...conditions))
    .orderBy(asc(bikes.id))
    .limit(query.limit);

  return {
    items: rows,
    nextCursor: rows.length === query.limit ? (rows[rows.length - 1]?.bikeId ?? null) : null,
  };
}

export interface StaffExpectedItem {
  reservationId: string;
  category: string;
  quantity: number;
  status: string;
  startsAt: Date;
  endsAt: Date;
  renterPhoneMasked: string;
}

export async function listExpectedRentals(
  outletId: string,
  date: string,
  limit: number,
): Promise<StaffExpectedItem[]> {
  const { start, end } = wibDayBounds(date);
  const rows = await db
    .select({
      reservationId: reservations.id,
      category: reservations.category,
      quantity: reservations.quantity,
      status: reservations.status,
      startsAt: reservations.startsAt,
      endsAt: reservations.endsAt,
      phone: users.phoneNumber,
    })
    .from(reservations)
    .innerJoin(renters, eq(renters.id, reservations.renterId))
    .innerJoin(users, eq(users.id, renters.userId))
    // Expected arrivals are live bookings only; expired/cancelled/no_show
    // rows are history, not a counter to look for.
    .where(
      and(
        eq(reservations.outletId, outletId),
        eq(reservations.status, "confirmed"),
        sql`${reservations.startsAt} >= ${start}::timestamptz`,
        sql`${reservations.startsAt} < ${end}::timestamptz`,
      ),
    )
    .orderBy(asc(reservations.startsAt))
    .limit(limit);

  return rows.map((r) => ({
    reservationId: r.reservationId,
    category: r.category,
    quantity: r.quantity,
    status: r.status,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    renterPhoneMasked: maskPhone(r.phone),
  }));
}

export interface StaffOverdueItem {
  rentalId: string;
  bikeAssetTag: string;
  renterPhoneMasked: string;
  checkedOutAt: Date;
  expectedEndAt: Date;
  escalationStage: number;
}

export async function listOverdueRentals(
  outletId: string,
  limit: number,
): Promise<StaffOverdueItem[]> {
  const rows = await db
    .select({
      rentalId: rentals.id,
      assetTag: bikes.assetTag,
      phone: users.phoneNumber,
      checkedOutAt: rentals.checkedOutAt,
      expectedEndAt: rentals.expectedEndAt,
      escalationStage: rentals.escalationStage,
    })
    .from(rentals)
    .innerJoin(bikes, eq(bikes.id, rentals.bikeId))
    .innerJoin(renters, eq(renters.id, rentals.renterId))
    .innerJoin(users, eq(users.id, renters.userId))
    .where(
      and(
        eq(rentals.status, "open"),
        eq(rentals.checkoutOutletId, outletId),
        sql`${rentals.expectedEndAt} < now()`,
      ),
    )
    .orderBy(asc(rentals.expectedEndAt))
    .limit(limit);

  return rows.map((r) => ({
    rentalId: r.rentalId,
    bikeAssetTag: r.assetTag,
    renterPhoneMasked: maskPhone(r.phone),
    checkedOutAt: r.checkedOutAt,
    expectedEndAt: r.expectedEndAt,
    escalationStage: r.escalationStage,
  }));
}
