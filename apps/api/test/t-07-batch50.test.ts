/**
 * D.7 (issue #43) — concurrency: a batch of 50 staff events replayed in a
 * shuffled arrival order is applied in ascending `occurredAt` (NFR-02 style
 * concurrency, FR-OFF-01.1/5). Extends T-07 to the 50-event batch cap.
 */
import { describe, expect, it, beforeAll, beforeEach, afterAll } from "vitest";
import { asc, eq } from "@repo/db";
import { db, rentals, reservations } from "@repo/db";
import { buildTestApp, truncateAll, type TestApp } from "./helpers.js";
import {
  checkoutEvent,
  seedConfirmedReservation,
  seedOffering,
  seedRenter,
  seedStaff,
  staffSessionCookie,
} from "./staff.helpers.js";

let t: TestApp;
const STAFF_EMAIL = "staff-t07b@kayooh.test";
const STAFF_PASSWORD = "staff-password-t07b-x";
const N = 50;

beforeAll(async () => {
  t = await buildTestApp();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await t.close();
});

describe("D.7: 50-event batch replayed out of order applies in ascending occurredAt", () => {
  it("applies all 50 and reports applied, in chronological order", async () => {
    const partner = await seedOffering(N);
    const startsAt = new Date(Math.ceil((Date.now() + 20 * 60_000) / 900_000) * 900_000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);

    const setups: Array<{ reservationId: string; bikeTag: string; occurredAt: string }> = [];
    for (let i = 0; i < N; i += 1) {
      const renter = await seedRenter();
      const confirmed = await seedConfirmedReservation({
        userId: renter.userId,
        outletId: partner.outletId,
        category: "commuter",
        window: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
      });
      // Distinct occurredAt offsets, deliberately not sorted by index.
      const offsetMin = (i * 7 + 3) % 40; // 0..39, shuffled-ish
      const occurredAt = new Date(startsAt.getTime() + offsetMin * 60_000).toISOString();
      setups.push({ reservationId: confirmed.reservationId, bikeTag: partner.bikeTags[i], occurredAt });
    }

    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, partner.outletId);
    const cookie = await staffSessionCookie(t, staff);

    const events = await Promise.all(
      setups.map((s) =>
        checkoutEvent({
          reservationId: s.reservationId,
          bikeAssetTags: [s.bikeTag],
          occurredAt: s.occurredAt,
        }),
      ),
    );

    // Shuffle arrival order (reverse is fine — server re-sorts).
    const shuffled = [...events].reverse();
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events/batch",
      headers: { cookie },
      payload: { events: shuffled },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { results: Array<{ status: string }> };
    expect(body.results).toHaveLength(N);
    for (const r of body.results) expect(r.status).toBe("applied");

    const rentalsAsc = await db.select().from(rentals).orderBy(asc(rentals.checkedOutAt));
    expect(rentalsAsc).toHaveLength(N);
    const occurredSorted = setups.map((s) => s.occurredAt).sort();
    const checkedAtISO = rentalsAsc.map((r) => (r.checkedOutAt as Date).toISOString());
    expect(checkedAtISO).toEqual(occurredSorted);

    for (const s of setups) {
      const rows = await db.select().from(reservations).where(eq(reservations.id, s.reservationId));
      expect(rows[0]?.status).toBe("fulfilled");
    }
  }, 120_000);
});
