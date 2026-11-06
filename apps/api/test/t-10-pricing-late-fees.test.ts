/**
 * T-10 (FR-PRC-01, FR-RNT-02) — table-driven pricing and late-fee cases from
 * the SRS ACs, against the REAL Postgres cluster (NFR-09).
 *
 * Pricing (FR-PRC-01, SRS §6.2):
 *   - 61 min -> 2 units (ceil on the billing unit);
 *   - weekday rate 10000, unit 60, window 90 min -> 20000;
 *   - the same 90 min window on a Saturday uses the weekend rate 15000 -> 30000.
 *
 * Late fees (FR-RNT-02.4, SRS §6.6; grace 15, 20000 per started 30 min):
 *   - check-in 12:15 (expected end 12:00) -> 0;
 *   - 12:16 -> 20000;
 *   - 13:01 -> 40000.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, eq, pricingRules, rentals } from "@repo/db";
import { quote } from "../src/modules/pricing/index.js";
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

const STAFF_EMAIL = "staff-t10@kayooh.test";
const STAFF_PASSWORD = "staff-password-t10-x";

/** 2030-01-07 is a Monday — 03:00 UTC = 10:00 WIB. */
const MONDAY_WIB = new Date(Date.UTC(2030, 0, 7, 3, 0, 0));
/** 2030-01-05 is a Saturday — 03:00 UTC = 10:00 WIB. */
const SATURDAY_WIB = new Date(Date.UTC(2030, 0, 5, 3, 0, 0));

const minutes = (d: Date, n: number): Date => new Date(d.getTime() + n * 60_000);

/* ------------------------------------------------------------------ */
/* FR-PRC-01 pricing                                                   */
/* ------------------------------------------------------------------ */

describe("T-10 (FR-PRC-01): table-driven pricing", () => {
  it("a 61 min window gives 2 units", async () => {
    const partner = await seedOffering(1);
    const r = await quote(db, {
      outletId: partner.outletId,
      category: "commuter",
      startsAt: MONDAY_WIB,
      endsAt: minutes(MONDAY_WIB, 61),
    });
    expect(r.unitMinutes).toBe(60);
    expect(r.rateIdr).toBe(10_000);
    expect(r.priceIdr).toBe(20_000); // ceil(61 / 60) = 2 units
    expect(r.finalIdr).toBe(20_000);
  });

  it("weekday 90 min at 10000/h gives 20000", async () => {
    const partner = await seedOffering(1);
    const r = await quote(db, {
      outletId: partner.outletId,
      category: "commuter",
      startsAt: MONDAY_WIB,
      endsAt: minutes(MONDAY_WIB, 90),
    });
    expect(r.dayType).toBe("weekday");
    expect(r.rateIdr).toBe(10_000);
    expect(r.priceIdr).toBe(20_000); // 2 units * 10000
  });

  it("the same 90 min window on a Saturday uses the weekend rate 15000 -> 30000", async () => {
    const partner = await seedOffering(1);
    await db.insert(pricingRules).values({
      outletId: partner.outletId,
      category: "commuter",
      dayType: "weekend",
      rateIdr: 15_000n,
      effectiveFrom: new Date(Date.now() - 3_600_000),
    });
    const r = await quote(db, {
      outletId: partner.outletId,
      category: "commuter",
      startsAt: SATURDAY_WIB,
      endsAt: minutes(SATURDAY_WIB, 90),
    });
    expect(r.dayType).toBe("weekend");
    expect(r.rateIdr).toBe(15_000);
    expect(r.priceIdr).toBe(30_000); // 2 units * 15000
  });
});

/* ------------------------------------------------------------------ */
/* FR-RNT-02 late fees                                                 */
/* ------------------------------------------------------------------ */

/** Books, checks out, and returns the open rental's `expected_end_at` (ms). */
async function checkoutOpenRental(): Promise<{
  partner: Awaited<ReturnType<typeof seedOffering>>;
  staffCookie: string;
  expectedEndAtMs: number;
}> {
  const partner = await seedOffering(1);
  const renter = await seedRenter();
  const window = nextWindow();
  const confirmed = await seedConfirmedReservation({
    userId: renter.userId,
    outletId: partner.outletId,
    category: "commuter",
    window,
  });
  const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, partner.outletId);
  const staffCookie = await staffSessionCookie(t, staff);

  const startsMs = new Date(window.startsAt).getTime();
  const event = await checkoutEvent({
    reservationId: confirmed.reservationId,
    bikeAssetTags: [partner.bikeTags[0]],
    occurredAt: new Date(startsMs + 5 * 60_000).toISOString(),
  });
  const res = await t.app.inject({
    method: "POST",
    url: "/api/v1/staff/events",
    headers: { cookie: staffCookie },
    payload: event,
  });
  expect(res.statusCode).toBe(200);
  return { partner, staffCookie, expectedEndAtMs: new Date(window.endsAt).getTime() };
}

/** Checks the bike in `offsetMinutes` after the expected end, returns the rental row. */
async function checkinOffset(offsetMinutes: number) {
  const { partner, staffCookie, expectedEndAtMs } = await checkoutOpenRental();
  const res = await t.app.inject({
    method: "POST",
    url: "/api/v1/staff/events",
    headers: { cookie: staffCookie },
    payload: {
      clientEventId: randomUUID(),
      occurredAt: new Date(expectedEndAtMs + offsetMinutes * 60_000).toISOString(),
      type: "checkin",
      payload: { bikeAssetTag: partner.bikeTags[0] },
    },
  });
  expect(res.statusCode).toBe(200);
  const [rental] = await db.select().from(rentals).where(eq(rentals.status, "returned"));
  expect(rental).toBeDefined();
  return rental;
}

describe("T-10 (FR-RNT-02): late fees (grace 15, 20000 per started 30 min)", () => {
  const cases: Array<{ label: string; offset: number; lateMinutes: number; fee: bigint }> = [
    { label: "12:15 (+15 min, at grace) -> 0", offset: 15, lateMinutes: 15, fee: 0n },
    { label: "12:16 (+16 min) -> 20000", offset: 16, lateMinutes: 16, fee: 20_000n },
    { label: "13:01 (+61 min) -> 40000", offset: 61, lateMinutes: 61, fee: 40_000n },
  ];

  for (const c of cases) {
    it(c.label, async () => {
      const rental = await checkinOffset(c.offset);
      expect(rental.lateMinutes).toBe(c.lateMinutes);
      expect(rental.lateFeeIdr).toBe(c.fee);
    });
  }
});
