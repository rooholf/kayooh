/**
 * T-16 (FR-RNT-01.3 / FR-RNT-02.2 / FR-RNT-03.1) — scan flags.
 *
 * Each flagged event is WELL-FORMED but physically impossible. The server
 * records the `reason` on the scan row, but leaves the bike, rental and
 * reservation state entirely unchanged.
 *
 * Also exercises the `rejected` classification (bad voucher signature).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, eq } from "@repo/db";
import { bikeEvents, bikes, rentals, reservations, scanEvents } from "@repo/db";
import { buildTestApp, truncateAll, type TestApp } from "./helpers.js";
import {
  checkoutEvent,
  nextWindow,
  seedConfirmedReservation,
  seedOffering,
  seedRenter,
  seedStaff,
  staffSessionCookie,
} from "./staff.helpers.js";

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

const STAFF_EMAIL = "staff-t16@kayooh.test";
const STAFF_PASSWORD = "staff-password-t16-x";
const CROSS_EMAIL = "cross-owner-t16@kayooh.test";
const CROSS_PASSWORD = "cross-owner-pw-t16-x";

interface Case {
  partner: Awaited<ReturnType<typeof seedOffering>>;
  confirmed: Awaited<ReturnType<typeof seedConfirmedReservation>>;
  bikeTag: string;
  staffCookie: string;
}

async function setupCase(mutate?: (ctx: Case) => Promise<void>): Promise<Case> {
  const partner = await seedOffering(1);
  const renter = await seedRenter();
  const confirmed = await seedConfirmedReservation({
    userId: renter.userId,
    outletId: partner.outletId,
    category: "commuter",
    window: nextWindow(),
  });
  const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, partner.outletId);
  const staffCookie = await staffSessionCookie(t, staff);
  const ctx: Case = { partner, confirmed, bikeTag: partner.bikeTags[0], staffCookie };
  if (mutate) await mutate(ctx);
  return ctx;
}

async function postCheckout(ctx: Case, overrides?: { occurredAt?: string; voucherToken?: string }) {
  const resRows = await db.select().from(reservations).where(eq(reservations.id, ctx.confirmed.reservationId));
  const r = resRows[0];
  const expectedBalance = Number((r?.finalIdr ?? 0n) - (r?.dpIdr ?? 0n));
  // Default: 5 minutes AFTER the reservation window opens (a normal scan).
  const startsAtMs = new Date(ctx.confirmed.window.startsAt).getTime();
  const event = await checkoutEvent({
    reservationId: ctx.confirmed.reservationId,
    bikeAssetTags: [ctx.bikeTag],
    occurredAt: overrides?.occurredAt ?? new Date(startsAtMs + 5 * 60_000).toISOString(),
    voucherToken: overrides?.voucherToken,
    balanceCollection: { amountIdr: expectedBalance, method: "cash" },
  });
  const res = await t.app.inject({
    method: "POST",
    url: "/api/v1/staff/events",
    headers: { cookie: ctx.staffCookie },
    payload: event,
  });
  return { res, event };
}

/** Asserts the flagged scan left every guarded state untouched. */
async function assertUnchanged(
  ctx: Case,
  expectedReservationStatus: string,
  expectedBikeState = "available",
) {
  const rentalRows = await db.select().from(rentals);
  expect(rentalRows).toHaveLength(0);

  const bikeRows = await db.select().from(bikes).where(eq(bikes.assetTag, ctx.bikeTag));
  const bike = bikeRows[0];
  expect(bike).toBeDefined();
  expect(bike?.state).toBe(expectedBikeState);
  expect(bike?.currentOutletId).toBe(ctx.partner.outletId);

  const resRows = await db.select().from(reservations).where(eq(reservations.id, ctx.confirmed.reservationId));
  expect(resRows[0]?.status).toBe(expectedReservationStatus);

  const beRows = await db.select().from(bikeEvents);
  expect(beRows).toHaveLength(0);

  const scanRows = await db.select().from(scanEvents);
  expect(scanRows).toHaveLength(1);
  expect(scanRows[0]?.status).toBe("flagged");
  expect(scanRows[0]?.flagReason).toBeTruthy();
}

describe("T-16 (RNT-01.3): flagged scans leave state unchanged", () => {
  it("flag RESERVATION_NOT_CONFIRMED when the reservation is no_show", async () => {
    const ctx = await setupCase(async (c) => {
      await db.update(reservations).set({ status: "no_show" }).where(eq(reservations.id, c.confirmed.reservationId));
    });
    const { res } = await postCheckout(ctx);
    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: { code: string; reason?: string } };
    expect(body.error.code).toBe("SCAN_FLAGGED");
    expect(body.error.reason).toBe("RESERVATION_NOT_CONFIRMED");

    await assertUnchanged(ctx, "no_show");
  });

  it("flag WRONG_OUTLET when the staff outlet differs from the reservation outlet", async () => {
    const reservationOutlet = await seedOffering(1);
    const staffOutlet = await seedOffering(1);
    const renter = await seedRenter();
    const confirmed = await seedConfirmedReservation({
      userId: renter.userId,
      outletId: reservationOutlet.outletId,
      category: "commuter",
      window: nextWindow(),
    });
    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, staffOutlet.outletId);
    const staffCookie = await staffSessionCookie(t, staff);
    const ctx: Case = {
      partner: reservationOutlet,
      confirmed,
      bikeTag: reservationOutlet.bikeTags[0],
      staffCookie,
    };

    const { res } = await postCheckout(ctx);
    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: { code: string; reason?: string } };
    expect(body.error.code).toBe("SCAN_FLAGGED");
    expect(body.error.reason).toBe("WRONG_OUTLET");

    await assertUnchanged(ctx, "confirmed");
  });

  it("flag CATEGORY_MISMATCH when the bike category differs from the reservation category", async () => {
    // Reservation at the same outlet but for the OTHER category.
    const partner = await seedOffering(1, "road"); // bike is road
    const renter = await seedRenter();
    const confirmed = await seedConfirmedReservation({
      userId: renter.userId,
      outletId: partner.outletId,
      category: "road",
      window: nextWindow(),
    });
    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, partner.outletId);
    const staffCookie = await staffSessionCookie(t, staff);

    // Pretend the reservation is for commuter while the bike is road.
    await db.update(reservations).set({ category: "commuter" }).where(eq(reservations.id, confirmed.reservationId));

    const ctx: Case = { partner, confirmed, bikeTag: partner.bikeTags[0], staffCookie };
    const { res } = await postCheckout(ctx);
    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: { code: string; reason?: string } };
    expect(body.error.code).toBe("SCAN_FLAGGED");
    expect(body.error.reason).toBe("CATEGORY_MISMATCH");

    await assertUnchanged(ctx, "confirmed");
  });

  it("flag BIKE_NOT_AVAILABLE when the bike is not `available`", async () => {
    const ctx = await setupCase(async (c) => {
      await db.update(bikes).set({ state: "maintenance" }).where(eq(bikes.assetTag, c.bikeTag));
    });
    const { res } = await postCheckout(ctx);
    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: { code: string; reason?: string } };
    expect(body.error.code).toBe("SCAN_FLAGGED");
    expect(body.error.reason).toBe("BIKE_NOT_AVAILABLE");

    const bikeRows = await db.select().from(bikes).where(eq(bikes.assetTag, ctx.bikeTag));
    expect(bikeRows[0]?.state).toBe("maintenance");
    await assertUnchanged(ctx, "confirmed", "maintenance");
  });

  it("flag TOO_EARLY when occurredAt is before starts_at (checkout.early_minutes 0)", async () => {
    const ctx = await setupCase();
    const { res } = await postCheckout(ctx, { occurredAt: new Date().toISOString() });
    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: { code: string; reason?: string } };
    expect(body.error.code).toBe("SCAN_FLAGGED");
    expect(body.error.reason).toBe("TOO_EARLY");

    await assertUnchanged(ctx, "confirmed");
  });

  it("reject VOUCHER_INVALID (legacy v1. HMAC token) — the bike state stays untouched", async () => {
    // The pre-EdDSA wire format must no longer verify (FR-SEC-01.1).
    const ctx = await setupCase();
    const { res } = await postCheckout(ctx, { voucherToken: "v1.not-a-reservation.99999999.deadbeef" });
    expect(res.statusCode).toBe(422);
    const body = res.json() as { error: { code: string; reason?: string } };
    expect(body.error.code).toBe("VOUCHER_INVALID");

    const rentalRows = await db.select().from(rentals);
    expect(rentalRows).toHaveLength(0);
    const bikeRows = await db.select().from(bikes).where(eq(bikes.assetTag, ctx.bikeTag));
    expect(bikeRows[0]?.state).toBe("available");
    const resRows = await db.select().from(reservations).where(eq(reservations.id, ctx.confirmed.reservationId));
    expect(resRows[0]?.status).toBe("confirmed");
  });

  it("flag WRONG_OWNER_OUTLET when a cross-owner staff tries the check-in", async () => {
    // Book + check out at outlet A (owner X).
    const partner = await seedOffering(1);
    const renter = await seedRenter();
    const confirmed = await seedConfirmedReservation({
      userId: renter.userId,
      outletId: partner.outletId,
      category: "commuter",
      window: nextWindow(),
    });
    const staffA = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, partner.outletId);
    const staffACookie = await staffSessionCookie(t, staffA);

    const checkoutEventPayload = await checkoutEvent({
      reservationId: confirmed.reservationId,
      bikeAssetTags: [partner.bikeTags[0]],
      occurredAt: new Date(new Date(confirmed.window.startsAt).getTime() + 5 * 60_000).toISOString(),
    });
    const checkoutRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie: staffACookie },
      payload: checkoutEventPayload,
    });
    expect(checkoutRes.statusCode).toBe(200);

    // A second owner's outlet: the charter's owner is DIFFERENT from the bike's.
    const otherPartner = await seedOffering(1);
    const otherStaff = await seedStaff(CROSS_EMAIL, CROSS_PASSWORD, otherPartner.outletId);
    const otherCookie = await staffSessionCookie(t, otherStaff);

    const checkinRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie: otherCookie },
      payload: {
        clientEventId: "12345678-1234-4234-8234-123456789abc",
        occurredAt: nextWindow(48 * 60 + 5).startsAt,
        type: "checkin",
        payload: { bikeAssetTag: partner.bikeTags[0] },
      },
    });
    expect(checkinRes.statusCode).toBe(409);
    const body = checkinRes.json() as { error: { code: string; reason?: string } };
    expect(body.error.code).toBe("SCAN_FLAGGED");
    expect(body.error.reason).toBe("WRONG_OWNER_OUTLET");

    // The bike stays `in_rental` and the rental stays `open`.
    const bikeRows = await db.select().from(bikes).where(eq(bikes.assetTag, partner.bikeTags[0]));
    expect(bikeRows[0]?.state).toBe("in_rental");
    const rentalRows = await db.select().from(rentals);
    expect(rentalRows).toHaveLength(1);
    expect(rentalRows[0]?.status).toBe("open");
  });

  it("rejects a checkout with too few photos (VALIDATION_ERROR) — nothing applied", async () => {
    const ctx = await setupCase();
    const event = await checkoutEvent({
      reservationId: ctx.confirmed.reservationId,
      bikeAssetTags: [ctx.bikeTag],
      occurredAt: new Date(new Date(ctx.confirmed.window.startsAt).getTime() + 5 * 60_000).toISOString(),
    });
    event.payload.photoKeys = [];
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie: ctx.staffCookie },
      payload: event,
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
    // Nothing applied: no rental, bike untouched, reservation still confirmed.
    expect(await db.select().from(rentals)).toHaveLength(0);
    const bikeRows = await db.select().from(bikes).where(eq(bikes.assetTag, ctx.bikeTag));
    expect(bikeRows[0]?.state).toBe("available");
    const resRows = await db.select().from(reservations).where(eq(reservations.id, ctx.confirmed.reservationId));
    expect(resRows[0]?.status).toBe("confirmed");
  });
});
