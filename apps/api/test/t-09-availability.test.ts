/**
 * T-09 (FR-INV-01) — availability computation, quantity-aware.
 *
 * Table-driven cases from the FR-INV-01 AC (SRS §6.4):
 *   - `committedReservations` is the SUM of `quantity`, not a row count;
 *   - the half-open [starts_at, ends_at) overlap rule;
 *   - the safety buffer;
 *   - expired holds and `at_risk` confirmed reservations stop counting;
 *   - an overdue open rental keeps counting (never double-book a late bike).
 *
 * Runs against the REAL Postgres cluster (NFR-09), function level.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  bikes,
  categories,
  db,
  outletCategories,
  outlets,
  owners,
  renters,
  rentals,
  reservations,
  users,
} from "@repo/db";
import { computeAvailability } from "../src/modules/inventory/index.js";
import { truncateAll } from "./helpers.js";

/* ------------------------------------------------------------------ */
/* Seeds                                                               */
/* ------------------------------------------------------------------ */

/** A Monday in 2030 — every window below is relative to it (always future). */
const BASE = new Date(Date.UTC(2030, 0, 7, 3, 0, 0));
const at = (minutes: number): Date => new Date(BASE.getTime() + minutes * 60_000);

interface Fixture {
  ownerId: string;
  outletId: string;
  renterId: string;
  bikeIds: string[];
}

async function seedFixture(opts: { bikeCount: number; buffer?: number }): Promise<Fixture> {
  const [owner] = await db.insert(owners).values({ name: "owner-t09" }).returning({ id: owners.id });
  const [outlet] = await db
    .insert(outlets)
    .values({
      ownerId: owner.id,
      code: `JMB-T09-${Math.floor(Math.random() * 1e6)}`,
      name: "T-09 Outlet",
      address: "Jl. T09 No. 1, Jambi",
      lat: "-1.610000",
      lng: "103.613000",
      hours: {
        sun: [{ open: "00:00", close: "23:45" }],
        mon: [{ open: "00:00", close: "23:45" }],
        tue: [{ open: "00:00", close: "23:45" }],
        wed: [{ open: "00:00", close: "23:45" }],
        thu: [{ open: "00:00", close: "23:45" }],
        fri: [{ open: "00:00", close: "23:45" }],
        sat: [{ open: "00:00", close: "23:45" }],
      },
    })
    .returning({ id: outlets.id });

  await db.insert(categories).values([{ code: "commuter", name: "Commuter" }]).onConflictDoNothing();
  await db.insert(outletCategories).values({
    outletId: outlet.id,
    ownerId: owner.id,
    category: "commuter",
    safetyBuffer: opts.buffer ?? 0,
    active: true,
  });

  const bikeRows = await db
    .insert(bikes)
    .values(
      Array.from({ length: opts.bikeCount }, (_, i) => ({
        ownerId: owner.id,
        assetTag: `T09-${outlet.id.slice(0, 8)}-${i}-${randomUUID().slice(0, 8)}`,
        category: "commuter",
        homeOutletId: outlet.id,
        currentOutletId: outlet.id,
        state: "available" as const,
      })),
    )
    .returning({ id: bikes.id });

  const [user] = await db
    .insert(users)
    .values({
      email: `t09.${Date.now()}@renters.kayooh.test`,
      emailVerified: false,
      name: "renter",
      role: "renter",
    })
    .returning({ id: users.id });
  const [renter] = await db
    .insert(renters)
    .values({ userId: user.id })
    .returning({ id: renters.id });

  return { ownerId: owner.id, outletId: outlet.id, renterId: renter.id, bikeIds: bikeRows.map((b) => b.id) };
}

interface ReservationSpec {
  quantity: number;
  status: "held" | "confirmed";
  startsAt: Date;
  endsAt: Date;
  expiresAt?: Date | null;
  atRisk?: boolean;
}

async function addReservation(f: Fixture, spec: ReservationSpec): Promise<string> {
  const [row] = await db
    .insert(reservations)
    .values({
      renterId: f.renterId,
      outletId: f.outletId,
      ownerId: f.ownerId,
      category: "commuter",
      quantity: spec.quantity,
      startsAt: spec.startsAt,
      endsAt: spec.endsAt,
      status: spec.status,
      expiresAt:
        spec.status === "held" ? (spec.expiresAt ?? new Date(Date.now() + 15 * 60_000)) : null,
      confirmedAt: spec.status === "confirmed" ? new Date() : null,
      priceIdr: 10_000n,
      finalIdr: 10_000n,
      dpIdr: 5_000n,
      ownerPromoBps: 0,
      rateSnapshot: { rateIdr: 10_000, unitMinutes: 60, dayType: "weekday" },
      atRisk: spec.atRisk ?? false,
    })
    .returning({ id: reservations.id });
  return row.id;
}

async function addOpenRental(f: Fixture, opts: { bikeId: string; expectedEndAt: Date }): Promise<void> {
  const [res] = await db
    .insert(reservations)
    .values({
      renterId: f.renterId,
      outletId: f.outletId,
      ownerId: f.ownerId,
      category: "commuter",
      quantity: 1,
      startsAt: new Date(Date.now() - 3 * 3_600_000),
      endsAt: new Date(Date.now() - 2 * 3_600_000),
      status: "fulfilled",
      priceIdr: 10_000n,
      finalIdr: 10_000n,
      dpIdr: 5_000n,
      ownerPromoBps: 0,
      rateSnapshot: { rateIdr: 10_000, unitMinutes: 60, dayType: "weekday" },
    })
    .returning({ id: reservations.id });

  await db.insert(rentals).values({
    reservationId: res.id,
    renterId: f.renterId,
    bikeId: opts.bikeId,
    ownerId: f.ownerId,
    checkoutOutletId: f.outletId,
    checkedOutAt: new Date(Date.now() - 3 * 3_600_000),
    expectedEndAt: opts.expectedEndAt,
    status: "open",
    checkoutChecklist: {},
  });
}

const avail = (f: Fixture, startsAt: Date, endsAt: Date) =>
  computeAvailability(db, { outletId: f.outletId, category: "commuter", startsAt, endsAt });

beforeEach(async () => {
  await truncateAll();
});

/* ------------------------------------------------------------------ */
/* FR-INV-01 AC cases                                                  */
/* ------------------------------------------------------------------ */

describe("T-09 (FR-INV-01): availability is quantity-aware", () => {
  it("5 bikes, buffer 0, no commitments -> 5", async () => {
    const f = await seedFixture({ bikeCount: 5 });
    expect(await avail(f, at(0), at(60))).toBe(5);
  });

  it("5 bikes, buffer 1, no commitments -> 4", async () => {
    const f = await seedFixture({ bikeCount: 5, buffer: 1 });
    expect(await avail(f, at(0), at(60))).toBe(4);
  });

  it("5 bikes, four overlapping confirmed reservations of quantity 1 -> 1", async () => {
    const f = await seedFixture({ bikeCount: 5 });
    for (let i = 0; i < 4; i += 1) {
      await addReservation(f, { quantity: 1, status: "confirmed", startsAt: at(0), endsAt: at(60) });
    }
    expect(await avail(f, at(0), at(60))).toBe(1);
  });

  it("sums quantity: one confirmed reservation of quantity 3 leaves 2", async () => {
    const f = await seedFixture({ bikeCount: 5 });
    await addReservation(f, { quantity: 3, status: "confirmed", startsAt: at(0), endsAt: at(60) });
    expect(await avail(f, at(0), at(60))).toBe(2);
  });

  it("half-open overlap: a 10:00-11:00 reservation does not touch the 11:00-12:00 window", async () => {
    const f = await seedFixture({ bikeCount: 5 });
    await addReservation(f, { quantity: 5, status: "confirmed", startsAt: at(0), endsAt: at(60) });
    expect(await avail(f, at(60), at(120))).toBe(5); // 11:00-12:00 untouched
    expect(await avail(f, at(30), at(90))).toBe(0); // 10:30-11:30 overlaps
  });

  it("an expired hold stops counting its quantity", async () => {
    const f = await seedFixture({ bikeCount: 5 });
    await addReservation(f, {
      quantity: 4,
      status: "held",
      startsAt: at(0),
      endsAt: at(60),
      expiresAt: new Date(Date.now() - 60_000), // already released
    });
    expect(await avail(f, at(0), at(60))).toBe(5);
  });

  it("an `at_risk` confirmed reservation stops counting", async () => {
    const f = await seedFixture({ bikeCount: 5 });
    await addReservation(f, {
      quantity: 5,
      status: "confirmed",
      startsAt: at(0),
      endsAt: at(60),
      atRisk: true,
    });
    expect(await avail(f, at(0), at(60))).toBe(5);
  });

  it("an overdue open rental keeps counting against a later window", async () => {
    const f = await seedFixture({ bikeCount: 5 });
    await addOpenRental(f, { bikeId: f.bikeIds[0], expectedEndAt: new Date(Date.now() - 3_600_000) });
    // Not yet returned by staff -> still occupies a bike next week.
    expect(await avail(f, at(0), at(60))).toBe(4);
  });

  it("availability is clamped at 0 (never negative)", async () => {
    const f = await seedFixture({ bikeCount: 2 });
    await addReservation(f, { quantity: 2, status: "confirmed", startsAt: at(0), endsAt: at(60) });
    await addReservation(f, { quantity: 2, status: "confirmed", startsAt: at(0), endsAt: at(60) });
    expect(await avail(f, at(0), at(60))).toBe(0);
  });
});
