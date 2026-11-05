/**
 * T-07 (FR-OFF-01) — offline event queue semantics on the REAL Postgres cluster:
 *   1. A batch replayed in shuffled arrival order is applied in ASCENDING
 *      occurredAt (the server owns the order, the PWA cannot).
 *   2. Replaying the SAME checkout `clientEventId` (any number of times)
 *      yields exactly ONE rental — duplicates are returns of the first
 *      stored result, not new rentals.
 *   3. Batches above 50 events are rejected with a validation error (cap).
 */
import { describe, expect, it, beforeAll, beforeEach, afterAll } from "vitest";
import { asc, eq } from "@repo/db";
import { paymentIntents, reservations, scanEvents, bikeEvents, rentals } from "@repo/db";
import { buildTestApp, truncateAll, type TestApp } from "./helpers.js";
import { db } from "@repo/db";
import {
  checkoutEvent,
  seedConfirmedReservation,
  seedOffering,
  seedRenter,
  seedStaff,
  staffSessionCookie,
} from "./staff.helpers.js";

let t: TestApp;
let staffCookie: string;

beforeAll(async () => {
  t = await buildTestApp();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await t.close();
});

const STAFF_EMAIL = "staff-t07@kayooh.test";
const STAFF_PASSWORD = "staff-password-t07-x";

interface Setup {
  partner: Awaited<ReturnType<typeof seedOffering>>;
  reservations: Array<{ reservationId: string; bikeTag: string; occurredAt: string }>;
}

/** Three confirmed reservations over 3 bikes; each checkout at a distinct, non-sorted occurredAt. */
async function setupThreeReservations(): Promise<Setup> {
  const partner = await seedOffering(3);
  // The shared window starts on the first 15-min slot boundary >= now+20 min
  // (immediate scan, but not TOO_EARLY, and slot-aligned per FR-INV-02).
  const startsAt = new Date(Math.ceil((Date.now() + 20 * 60_000) / 900_000) * 900_000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);

  const rigged: Array<{ reservationId: string; bikeTag: string; occurredAt: string }> = [];
  for (let i = 0; i < 3; i += 1) {
    const renter = await seedRenter();
    const confirmed = await seedConfirmedReservation({
      userId: renter.userId,
      outletId: partner.outletId,
      category: "commuter",
      window: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
    });
    // occurredAt offsets AFTER starts_at, deliberately out of order:
    // i=0 -> starts+5, i=1 -> starts+9, i=2 -> starts+3.
    const offsetMin = i === 0 ? 5 : i === 1 ? 9 : 3;
    const occurredAt = new Date(startsAt.getTime() + offsetMin * 60_000).toISOString();
    rigged.push({ reservationId: confirmed.reservationId, bikeTag: partner.bikeTags[i], occurredAt });
  }
  return { partner, reservations: rigged };
}

function batchFor(setup: Setup, order: number[]): Array<ReturnType<typeof checkoutEvent>> {
  // order[i] declares which event (by setup index) is sent at batch position i.
  return order.map((idx) =>
    checkoutEvent({
      reservationId: setup.reservations[idx].reservationId,
      bikeAssetTag: setup.reservations[idx].bikeTag,
      occurredAt: setup.reservations[idx].occurredAt,
    }),
  );
}

describe("T-07 (FR-OFF-01): staff events batch + idempotent replay", () => {
  it("applies a shuffled batch in ascending occurredAt", async () => {
    const setup = await setupThreeReservations();
    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, setup.partner.outletId);
    staffCookie = await staffSessionCookie(t, staff);

    const shuffledSentOrder = [1, 2, 0]; // arrival order, NOT chronological.
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events/batch",
      headers: { cookie: staffCookie },
      payload: { events: batchFor(setup, shuffledSentOrder) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { results: Array<{ clientEventId: string; status: string; reason?: string }> };
    expect(body.results).toHaveLength(3);
    for (const r of body.results) expect(r.status).toBe("applied");

    // Applied in chronological order: rentals' checkedOutAt must be the
    // occurredAt values sorted ascending.
    const rentalsAsc = await db.select().from(rentals).orderBy(asc(rentals.checkedOutAt));
    expect(rentalsAsc).toHaveLength(3);
    const occurredOrder = setup.reservations.map((r) => r.occurredAt).sort();
    const checkedAtISO = rentalsAsc.map((r) => (r.checkedOutAt as Date).toISOString());
    expect(checkedAtISO).toEqual(occurredOrder);

    // The reservations are fulfilled and the bikes locked by the rentals.
    for (const r of setup.reservations) {
      const rows = await db.select().from(reservations).where(eq(reservations.id, r.reservationId));
      expect(rows[0]?.status).toBe("fulfilled");
    }
    const events = await db.select().from(bikeEvents);
    expect(events.some((e) => e.type === "checked_out")).toBe(true);
  });

  it("replays the same checkout clientEventId three times: one rental", async () => {
    const setup = await setupThreeReservations();
    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, setup.partner.outletId);
    staffCookie = await staffSessionCookie(t, staff);

    // One checkout event, three attempts (replay after network split).
    const first = setup.reservations[0];
    const event = checkoutEvent({
      reservationId: first.reservationId,
      bikeAssetTag: first.bikeTag,
      occurredAt: first.occurredAt,
    });
    const responses: Array<{ clientEventId: string; status: string; reason?: string }> = [];
    for (let i = 0; i < 3; i += 1) {
      const res = await t.app.inject({
        method: "POST",
        url: "/api/v1/staff/events",
        headers: { cookie: staffCookie },
        payload: event,
      });
      expect(res.statusCode).toBe(200);
      responses.push(res.json() as { clientEventId: string; status: string; reason?: string });
    }
    // All three requests agree: applied; each returns the first stored verdict.
    for (const r of responses) expect(r.status).toBe("applied");
    expect(responses[0]).toEqual(responses[1]);
    expect(responses[1]).toEqual(responses[2]);

    // ONE rental — no matter how often the same clientEventId arrives.
    const rentalsForRes = await db
      .select()
      .from(rentals)
      .where(eq(rentals.reservationId, first.reservationId));
    expect(rentalsForRes).toHaveLength(1);

    // One scan_events row, kept applied.
    const scanRows = await db
      .select()
      .from(scanEvents)
      .where(eq(scanEvents.clientEventId, event.clientEventId));
    expect(scanRows).toHaveLength(1);
    expect(scanRows[0]?.status).toBe("applied");

    // One custody-trail row (bike_events unique key on clientEventId).
    const beRows = await db
      .select()
      .from(bikeEvents)
      .where(eq(bikeEvents.clientEventId, event.clientEventId));
    expect(beRows).toHaveLength(1);
  });

  it("rejects an oversized batch but accepts a small one (cap 50)", async () => {
    const setup = await setupThreeReservations();
    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, setup.partner.outletId);
    staffCookie = await staffSessionCookie(t, staff);

    const many = Array.from({ length: 51 }, (_, i) =>
      checkoutEvent({
        reservationId: setup.reservations[0].reservationId,
        bikeAssetTag: setup.reservations[0].bikeTag,
        occurredAt: new Date(Date.now() + i * 1_000).toISOString(),
      }),
    );
    const oversized = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events/batch",
      headers: { cookie: staffCookie },
      payload: { events: many },
    });
    expect(oversized.statusCode).toBe(400);

    // Shaped like the PWA sync (mixed statuses allowed), at the cap boundary.
    const three = many.slice(0, 3);
    const accepted = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events/batch",
      headers: { cookie: staffCookie },
      payload: { events: three },
    });
    expect(accepted.statusCode).toBe(200);
    const body = accepted.json() as { results: Array<{ status: string }> };
    expect(body.results).toHaveLength(3);
  });

  it("leaves the payment intents intact; no intents are duplicated by replay", async () => {
    const setup = await setupThreeReservations();
    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, setup.partner.outletId);
    staffCookie = await staffSessionCookie(t, staff);

    const before = (await db.select().from(paymentIntents)).length;
    expect(before).toBeGreaterThanOrEqual(3);

    // Apply each checkout once AND replay once — intents must not grow.
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events/batch",
      headers: { cookie: staffCookie },
      payload: { events: batchFor(setup, [0, 1, 2]) },
    });
    expect(res.statusCode).toBe(200);
    const after = (await db.select().from(paymentIntents)).length;
    expect(after).toBe(before);

    // Reservations fulfilled (SRS section 5: confirmed -> fulfilled on checkout).
    const reservationsAfter = await db.select().from(reservations);
    for (const r of reservationsAfter) expect(r.status).toBe("fulfilled");
  });
});
