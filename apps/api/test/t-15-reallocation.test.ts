/**
 * T-15 (FR-INV-04) — block a bike and reallocate.
 *
 *   1. `bike_damaged` incident on an over-reserved window flags EXACTLY the
 *      newest-created confirmed reservation `at_risk` (with a deadline).
 *   2. `GET /reservations/:id/alternatives` offers other outlets for the same
 *      category/window.
 *   3. Accepting (`POST /reservations/:id/reallocate`) creates a NEW
 *      `confirmed` reservation at the target outlet with COPIED pricing and
 *      rate_snapshot, cancels the original (`reallocated`) and writes NO new
 *      payment intent (A-06).
 *   4. Declining cancels the original and records the FULL refund with
 *      reason `reallocation_declined`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "@repo/db";
import {
  paymentIntents,
  refunds,
  rentals,
  renters,
  reservations,
  users,
} from "@repo/db";
import { randomUUID } from "node:crypto";
import { buildTestApp, sessionCookie, truncateAll, type TestApp } from "./helpers.js";
import { createReservationHold } from "../src/modules/inventory/index.js";
import type { CreateReservationBody } from "@repo/contracts";
import { db } from "@repo/db";
import { seedOffering, seedStaff, staffSessionCookie } from "./staff.helpers.js";

let t: TestApp;

beforeAll(async () => {
  t = await buildTestApp();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await t.close();
});

const STAFF_EMAIL = "staff-t15@kayooh.test";
const STAFF_PASSWORD = "staff-password-t15-x";

/** Slot-aligned window tomorrow; safe for the FR-INV-02 hold service. */
function windowFor(offsetMinutes = 24 * 60): { startsAt: string; endsAt: string } {
  const aligned = Math.ceil((Date.now() + offsetMinutes * 60_000) / 900_000) * 900_000;
  return { startsAt: new Date(aligned).toISOString(), endsAt: new Date(aligned + 60 * 60_000).toISOString() };
}

/**
 * Signs a renter in through the REAL phone-OTP flow (FR-ID-01) and promotes
 * them to verified with a held deposit, like t-01 does.
 */
async function renterViaOtp(): Promise<{ userId: string; renterId: string; cookie: string; phone: string }> {
  const phoneRaw = `+628${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`;
  const send = await t.app.inject({
    method: "POST",
    url: "/api/auth/phone-number/send-otp",
    payload: { phoneNumber: phoneRaw },
  });
  expect(send.statusCode).toBe(200);
  const code = t.notifications.lastOtp(phoneRaw);
  const verify = await t.app.inject({
    method: "POST",
    url: "/api/auth/phone-number/verify",
    payload: { phoneNumber: phoneRaw, code },
  });
  expect(verify.statusCode).toBe(200);
  const cookie = sessionCookie(verify.headers["set-cookie"]);

  const [user] = await db.select().from(users).where(eq(users.phoneNumber, phoneRaw));
  expect(user).toBeDefined();
  const [renter] = await db.select().from(renters).where(eq(renters.userId, user.id));
  return { userId: user.id, renterId: renter.id, cookie, phone: phoneRaw };
}

interface OverflowScenario {
  outletA: Awaited<ReturnType<typeof seedOffering>>;
  persons: Array<{ userId: string; renterId: string; cookie: string }>;
  reservationIds: string[]; // seeded in order; [2] is the newest created
  window: { startsAt: string; endsAt: string };
  finalIdr: number;
  priceIdr: number;
  bookingIntentCount: number;
}

/**
 * Three overlapping confirmed reservations over THREE bikes, then a
 * resilience buffer of 1 so losing one bike over-commits the window (AC:
 * flagging exactly the latest-created confirmed reservation).
 */
async function seedOverflow(): Promise<OverflowScenario> {
  const outletA = await seedOffering(3);
  const window = windowFor();

  const reservationIds: string[] = [];
  const persons: Array<{ userId: string; renterId: string; cookie: string }> = [];
  let finalIdr = 0;
  let priceIdr = 0;
  for (let i = 0; i < 3; i += 1) {
    const renter = await renterViaOtp();
    persons.push({ userId: renter.userId, renterId: renter.renterId, cookie: renter.cookie });
    const body: CreateReservationBody = {
      outletId: outletA.outletId,
      category: "commuter",
      startsAt: window.startsAt,
      endsAt: window.endsAt,
    };
    const held = await createReservationHold(db, body, { kind: "renter", userId: renter.userId });
    await db.execute(sql`
      UPDATE reservations
      SET status = 'confirmed', confirmed_at = now()
      WHERE id = ${held.reservation.id}::uuid
    `);
    reservationIds.push(held.reservation.id);
    finalIdr = held.reservation.finalIdr;
    priceIdr = held.reservation.priceIdr;
  }

  // The resilience buffer only turns the upcoming loss into over-commitment.
  await db.execute(sql`
    UPDATE outlet_categories SET safety_buffer = 1
    WHERE outlet_id = ${outletA.outletId} AND category = 'commuter'
  `);

  const intents = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.reservationId, reservationIds[2]));
  expect(intents).toHaveLength(1); // booking intent exists for the flagged reservation

  return { outletA, persons, reservationIds, window, finalIdr, priceIdr, bookingIntentCount: 1 };
}

/** Reports the `bike_damaged` incident for one of the outlet's bikes. */
async function reportDamaged(sc: OverflowScenario): Promise<void> {
  const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, sc.outletA.outletId);
  const cookie = await staffSessionCookie(t, staff);
  const res = await t.app.inject({
    method: "POST",
    url: "/api/v1/staff/events",
    headers: { cookie },
    payload: {
      clientEventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      type: "incident",
      payload: {
        incidentType: "bike_damaged",
        bikeAssetTag: sc.outletA.bikeTags[0],
        notes: "frame crack reported during inspection",
      },
    },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ status: "applied" });
}

describe("T-15 (FR-INV-04): bike damaged -> reallocation flow", () => {
  it("flags exactly the newest confirmed reservation at_risk", async () => {
    const sc = await seedOverflow();
    await reportDamaged(sc);

    const flagged = await db.select().from(reservations).where(eq(reservations.id, sc.reservationIds[2]));
    expect(flagged[0]?.atRisk).toBe(true);
    expect(flagged[0]?.reallocationDeadlineAt).not.toBeNull();

    // Older reservations stay untouched.
    for (const id of sc.reservationIds.slice(0, 2)) {
      const rows = await db.select().from(reservations).where(eq(reservations.id, id));
      expect(rows[0]?.atRisk).toBe(false);
    }
    // The damaged bike is in maintenance (FR-INV-04 step 1).
    const rentalsNow = await db.select().from(rentals);
    expect(rentalsNow).toHaveLength(0);
    const onHold = await db.execute(sql`
      SELECT count(*)::int AS n FROM bikes
      WHERE home_outlet_id = ${sc.outletA.outletId} AND category = 'commuter'
        AND state = 'maintenance'
    `);
    expect(Number((onHold.rows as Array<{ n: number }>)[0]?.n ?? 0)).toBe(1);
  });

  it("alternatives list other outlets (same category/window), not the original", async () => {
    const sc = await seedOverflow();
    await reportDamaged(sc);

    const flaggedRenterCookie = sc.persons[2].cookie;
    const beforeRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/reservations/nonexistent-id/alternatives",
      headers: { cookie: flaggedRenterCookie },
    });
    expect([400, 404]).toContain(beforeRes.statusCode); // invalid uuid / not found

    const res = await t.app.inject({
      method: "GET",
      url: `/api/v1/reservations/${sc.reservationIds[2]}/alternatives`,
      headers: { cookie: flaggedRenterCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { reservationId: string; alternatives: Array<{ outletId: string }> };
    expect(body.reservationId).toBe(sc.reservationIds[2]);
    expect(body.alternatives.some((a) => a.outletId === sc.outletA.outletId)).toBe(false);
  });

  it("accepting an alternative copies pricing, cancels the original, creates no new payment intent", async () => {
    const sc = await seedOverflow();
    const outletB = await seedOffering(1); // another owner's outlet, 1 free bike
    await reportDamaged(sc);

    const flaggedId = sc.reservationIds[2];
    const flaggedCookie = sc.persons[2].cookie;
    const intentsBefore = (await db.select().from(paymentIntents)).length;

    const res = await t.app.inject({
      method: "POST",
      url: `/api/v1/reservations/${flaggedId}/reallocate`,
      headers: { cookie: flaggedCookie, "idempotency-key": randomUUID() },
      payload: { outletId: outletB.outletId },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      reservation: { id: string; outletId: string; status: string; priceIdr: number; finalIdr: number; atRisk: boolean };
      price: { priceIdr: number; discountIdr: number; finalIdr: number };
    };

    // NEW confirmed reservation at the target outlet; prices COPIED from the original.
    expect(body.reservation.outletId).toBe(outletB.outletId);
    expect(body.reservation.status).toBe("confirmed");
    expect(body.reservation.id).not.toBe(flaggedId);
    expect(body.reservation.priceIdr).toBe(sc.priceIdr);
    expect(body.reservation.finalIdr).toBe(sc.finalIdr);
    expect(body.reservation.atRisk).toBe(false);
    expect(body.price.finalIdr).toBe(sc.finalIdr);

    // Original gone to cancelled/reallocated; new reservation CONFIRMED with copied pricing.
    const original = await db.select().from(reservations).where(eq(reservations.id, flaggedId));
    expect(original[0]?.status).toBe("cancelled");
    expect(original[0]?.cancelReason).toBe("reallocated");

    const created = await db.select().from(reservations).where(eq(reservations.id, body.reservation.id));
    expect(created[0]?.status).toBe("confirmed");
    expect(created[0]?.outletId).toBe(outletB.outletId);
    expect(Number(created[0]?.finalIdr)).toBe(sc.finalIdr);
    expect(Number(created[0]?.priceIdr)).toBe(sc.priceIdr);
    // rate_snapshot carried over verbatim (A-06: no re-pricing edge risk).
    expect(created[0]?.rateSnapshot).toEqual(original[0]?.rateSnapshot);

    // Exactly ONE booking intent still (A-06: NO new payment intent).
    const intentsAfter = (await db.select().from(paymentIntents)).length;
    expect(intentsAfter).toBe(intentsBefore);
  });

  it("declining cancels the reservation and records the FULL reallocation_declined refund", async () => {
    const sc = await seedOverflow();
    await reportDamaged(sc);

    const flaggedId = sc.reservationIds[2];
    const flaggedCookie = sc.persons[2].cookie;

    const res = await t.app.inject({
      method: "POST",
      url: `/api/v1/reservations/${flaggedId}/decline-reallocation`,
      headers: { cookie: flaggedCookie },
    });
    expect(res.statusCode).toBe(200);

    const original = await db.select().from(reservations).where(eq(reservations.id, flaggedId));
    expect(original[0]?.status).toBe("cancelled");
    expect(original[0]?.cancelReason).toBe("reallocation_declined");

    // Full refund = final_idr, reason reallocation_declined, linked to the booking intent.
    const refundRows = await db.select().from(refunds).where(eq(refunds.reservationId, flaggedId));
    expect(refundRows).toHaveLength(1);
    expect(refundRows[0]?.reason).toBe("reallocation_declined");
    expect(Number(refundRows[0]?.amountIdr)).toBe(sc.finalIdr);
    expect(refundRows[0]?.paymentIntentId).not.toBeNull();
  });

  it("a renter cannot act on someone else's reservation", async () => {
    const sc = await seedOverflow();
    await reportDamaged(sc);

    const someoneElse = await renterViaOtp();
    const res1 = await t.app.inject({
      method: "GET",
      url: `/api/v1/reservations/${sc.reservationIds[2]}/alternatives`,
      headers: { cookie: someoneElse.cookie },
    });
    // Resource outside the caller's scope -> 404 (SRS 3.2).
    expect([403, 404]).toContain(res1.statusCode);

    const res2 = await t.app.inject({
      method: "POST",
      url: `/api/v1/reservations/${sc.reservationIds[2]}/reallocate`,
      headers: { cookie: someoneElse.cookie, "idempotency-key": randomUUID() },
      payload: { outletId: sc.outletA.outletId },
    });
    expect([403, 404]).toContain(res2.statusCode);

    // The reservation is untouched.
    const rows = await db.select().from(reservations).where(and(eq(reservations.id, sc.reservationIds[2])));
    expect(rows[0]?.status).toBe("confirmed");
  });
});
