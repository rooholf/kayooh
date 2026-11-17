/**
 * Edge/error paths of FR-INV-02 and its collaborators (D.8, NFR-09 coverage):
 *   - lock contention: Postgres 55P03 lock timeout → 503 INTERNAL, Retry-After 1
 *   - gateway failure compensation: cancelled reservation + failed intent + 502
 *   - direct confirm when the DP is 0 (booking.dp_rate_bps = 0)
 *   - guest identity: fresh guest token + the phone race (A-17)
 *   - pre-check refusals: lead/advance window, unknown/inactive outlet
 *   - defensive guards: availability row vanished, quote below minimum
 * Runs against the REAL Postgres cluster (NFR-09) on `kayooh_test`.
 */
import { describe, expect, it, beforeAll, beforeEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "@repo/db";
import { db, outboxEvents, paymentIntents, pool, pricingRules, reservations, renters } from "@repo/db";
import { buildTestApp, truncateAll, type TestApp } from "./helpers.js";
import { slotWindow } from "./staff.helpers.js";
import {
  computeAvailability,
  createReservationHold,
  isOpenAt,
  type ReservationActor,
} from "../src/modules/inventory/index.js";
import { quote } from "../src/modules/pricing/index.js";
import { AppError } from "../src/lib/errors.js";
import { invalidateConfigCache, setConfig } from "../src/modules/app-config/index.js";
import { users } from "@repo/db";
import type { CreateReservationBody } from "@repo/contracts";

let t: TestApp;

beforeAll(async () => {
  t = await buildTestApp();
});

beforeEach(async () => {
  await truncateAll();
  invalidateConfigCache();
});

afterAll(async () => {
  await t.close();
});

/* ------------------------------------------------------------------ */
/* Seeds                                                                */
/* ------------------------------------------------------------------ */

async function seedRenterUser(): Promise<string> {
  const email = `renter.${Date.now()}.${Math.floor(Math.random() * 1e6)}@renters.kayooh.test`;
  const [user] = await db
    .insert(users)
    .values({
      email,
      emailVerified: false,
      name: "renter",
      role: "renter",
      phoneNumber: `+62812${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
    })
    .returning({ id: users.id });
  await db.insert(renters).values({ userId: user!.id }).returning({ id: renters.id });
  return user!.id;
}

interface SeedPartner {
  outletId: string;
}

async function seedOffering(bikeCount: number, opts: { outletStatus?: "active" | "inactive"; offeringActive?: boolean } = {}): Promise<SeedPartner> {
  const { owners, outlets, categories, outletCategories, bikes } = await import("@repo/db");
  const [owner] = await db.insert(owners).values({ name: "owner-edges" }).returning({ id: owners.id });
  const [outlet] = await db
    .insert(outlets)
    .values({
      ownerId: owner.id,
      code: `JMB-0${Math.floor(Math.random() * 9) + 1}`,
      name: "Edge Test Outlet",
      address: "Jl. Edge No. 1, Jambi",
      lat: "-1.610000",
      lng: "103.613000",
      status: opts.outletStatus ?? "active",
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
  await db
    .insert(categories)
    .values([{ code: "commuter", name: "Commuter" }, { code: "road", name: "Road" }])
    .onConflictDoNothing();
  await db.insert(outletCategories).values({
    outletId: outlet.id,
    ownerId: owner.id,
    category: "commuter",
    safetyBuffer: 0,
    active: opts.offeringActive ?? true,
  });
  const tag = () => `JMB-0${Math.floor(Math.random() * 9) + 1}-TRK-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
  await db.insert(bikes).values(
    Array.from({ length: bikeCount }, () => ({
      ownerId: owner.id,
      assetTag: tag(),
      category: "commuter",
      homeOutletId: outlet.id,
      currentOutletId: outlet.id,
    })),
  );
  await db.insert(pricingRules).values({
    outletId: outlet.id,
    category: "commuter",
    rateIdr: 10_000n,
    effectiveFrom: new Date(Date.now() - 3_600_000),
  });
  return { outletId: outlet.id };
}

function bodyFor(partner: SeedPartner, w: { startsAt: string; endsAt: string }, category = "commuter"): CreateReservationBody {
  return { outletId: partner.outletId, category, startsAt: w.startsAt, endsAt: w.endsAt };
}

const renterActor = (userId: string): ReservationActor => ({ kind: "renter", userId });

async function expectAppError(p: Promise<unknown>, code: string, status?: number): Promise<AppError> {
  const err = await p.then(
    () => {
      throw new Error(`expected ${code} but the call succeeded`);
    },
    (e) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (status !== undefined) expect((err as AppError).status).toBe(status);
  return err as AppError;
}

/* ------------------------------------------------------------------ */
/* Tests                                                                */
/* ------------------------------------------------------------------ */

describe("FR-INV-02 edge paths (D.8 coverage)", () => {
  it("returns 503 INTERNAL with Retry-After 1 when the outlet_categories lock times out (NFR-02)", async () => {
    const partner = await seedOffering(2);
    const userId = await seedRenterUser();
    const client = await pool.connect();
    try {
      // Hold THE LOCK from a foreign transaction for the whole hold attempt.
      await client.query("BEGIN");
      await client.query(
        "SELECT safety_buffer FROM outlet_categories WHERE outlet_id = $1 AND category = 'commuter' FOR UPDATE",
        [partner.outletId],
      );
      const err = await expectAppError(
        createReservationHold(db, bodyFor(partner, slotWindow(20)), renterActor(userId)),
        "INTERNAL",
        503,
      );
      expect((err as AppError & { retryAfterSec?: number }).retryAfterSec).toBe(1);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  }, 30_000);

  it("cancels the hold and fails the intent when the payment gateway is unavailable (FR-INV-02 post-commit)", async () => {
    const partner = await seedOffering(2);
    const userId = await seedRenterUser();
    const prevNodeEnv = process.env.NODE_ENV;
    const prevKasera = process.env.KASERA_API;
    delete process.env.KASERA_API;
    process.env.NODE_ENV = "production"; // the factory refuses to return a gateway
    try {
      await expectAppError(
        createReservationHold(db, bodyFor(partner, slotWindow(20)), renterActor(userId)),
        "GATEWAY_UNAVAILABLE",
        502,
      );
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevKasera) process.env.KASERA_API = prevKasera;
    }
    const [reservation] = await db
      .select({ status: reservations.status, cancelReason: reservations.cancelReason })
      .from(reservations);
    expect(reservation?.status).toBe("cancelled");
    expect(reservation?.cancelReason).toBe("gateway_error");
    const [intent] = await db.select({ status: paymentIntents.status }).from(paymentIntents);
    expect(intent?.status).toBe("failed");
  });

  it("directly confirms a booking whose DP is 0 (booking.dp_rate_bps = 0): no intent, no outbox, no payment URL", async () => {
    const partner = await seedOffering(2);
    const userId = await seedRenterUser();
    const [admin] = await db
      .insert(users)
      .values({ email: `cfg.${Date.now()}@kayooh.test`, emailVerified: true, name: "cfg", role: "admin" })
      .returning({ id: users.id });
    await setConfig({ key: "booking.dp_rate_bps", value: 0, actorId: admin!.id });
    invalidateConfigCache();

    const response = await createReservationHold(db, bodyFor(partner, slotWindow(20)), renterActor(userId));
    expect(response.reservation.status).toBe("confirmed");
    expect(response.reservation.confirmedAt).not.toBeNull();
    expect(response.reservation.expiresAt).toBeNull();
    expect(response.reservation.dpIdr).toBe(0);
    expect(response.paymentUrl).toBeUndefined();
    expect(response.guestToken).toBeUndefined();

    const intents = await db.select().from(paymentIntents);
    expect(intents).toHaveLength(0);
    const outbox = await db.select().from(outboxEvents).where(eq(outboxEvents.type, "reservation.held"));
    expect(outbox).toHaveLength(0);
  });

  it("returns a reservation-scoped guest token and delivers the WhatsApp notification (A-18 / FR-NOT-01.4)", async () => {
    const partner = await seedOffering(2);
    const guest: ReservationActor = { kind: "guest", phone: `+62813${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}` };

    const response = await createReservationHold(db, bodyFor(partner, slotWindow(20)), guest);
    expect(response.guestToken).toEqual(expect.any(String));
    const [reservation] = await db.select({ id: reservations.id, status: reservations.status }).from(reservations);
    expect(reservation?.status).toBe("held");
    const notification = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.type, "notification.send"));
    expect(notification.length).toBeGreaterThan(0);
  });

  it("resolves a guest booking to an EXISTING renter row on the phone race (A-17)", async () => {
    const partner = await seedOffering(2);
    const phone = `+62814${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    const [existing] = await db
      .insert(renters)
      .values({ userId: null, phone })
      .returning({ id: renters.id });

    const response = await createReservationHold(db, bodyFor(partner, slotWindow(20)), { kind: "guest", phone });
    const [reservation] = await db
      .select({ renterId: reservations.renterId })
      .from(reservations)
      .where(eq(reservations.id, response.reservation.id));
    expect(reservation?.renterId).toBe(existing!.id);
    expect(await db.select().from(renters).where(eq(renters.phone, phone))).toHaveLength(1);
  });

  it("refuses windows outside the bookable range (V-TS lead / max advance)", async () => {
    const partner = await seedOffering(1);
    const userId = await seedRenterUser();

    // Too early: startsAt in the past.
    const past = new Date(Math.floor(Date.now() / 900_000) * 900_000 - 30 * 60_000);
    await expectAppError(
      createReservationHold(db, bodyFor(partner, { startsAt: past.toISOString(), endsAt: new Date(past.getTime() + 3_600_000).toISOString() }), renterActor(userId)),
      "WINDOW_OUT_OF_RANGE",
    );

    // Too far ahead: max_advance_days = 7 (default).
    const farAhead = new Date(Date.now() + 40 * 86_400_000);
    farAhead.setUTCMinutes(0, 0, 0);
    await expectAppError(
      createReservationHold(db, bodyFor(partner, { startsAt: farAhead.toISOString(), endsAt: new Date(farAhead.getTime() + 3_600_000).toISOString() }), renterActor(userId)),
      "WINDOW_OUT_OF_RANGE",
    );
  });

  it("refuses unknown outlets and inactive outlets / offerings (pre-check 5)", async () => {
    const userId = await seedRenterUser();
    await expectAppError(
      createReservationHold(db, bodyFor({ outletId: randomUUID() }, slotWindow(20)), renterActor(userId)),
      "NOT_FOUND",
    );

    const inactiveOutlet = await seedOffering(1, { outletStatus: "inactive" });
    await expectAppError(
      createReservationHold(db, bodyFor(inactiveOutlet, slotWindow(20)), renterActor(userId)),
      "CATEGORY_NOT_OFFERED",
    );

    const inactiveOffering = await seedOffering(1, { offeringActive: false });
    await expectAppError(
      createReservationHold(db, bodyFor(inactiveOffering, slotWindow(20)), renterActor(userId)),
      "CATEGORY_NOT_OFFERED",
    );
  });

  it("throws the row-vanished guard from computeAvailability for a missing outlet_categories row", async () => {
    await expect(
      computeAvailability(db, {
        outletId: randomUUID(),
        category: "commuter",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3_600_000),
      }),
    ).rejects.toThrow(/row vanished mid-transaction/);
  });

  it("refuses a quote below payments.min_charge_idr (FR-PRC-01.5)", async () => {
    const partner = await seedOffering(1);
    const [admin] = await db
      .insert(users)
      .values({ email: `cfg2.${Date.now()}@kayooh.test`, emailVerified: true, name: "cfg2", role: "admin" })
      .returning({ id: users.id });
    await setConfig({ key: "payments.min_charge_idr", value: 100_000, actorId: admin!.id });
    invalidateConfigCache();

    const w = slotWindow(20);
    await expectAppError(
      quote(db, {
        outletId: partner.outletId,
        category: "commuter",
        startsAt: new Date(w.startsAt),
        endsAt: new Date(w.endsAt),
      }),
      "AMOUNT_BELOW_MINIMUM",
    );
  });

  it("isOpenAt returns false for malformed hours (bad data can never widen availability)", () => {
    expect(isOpenAt("garbage", new Date())).toBe(false);
    expect(
      isOpenAt({ sun: [{ open: "0000", close: "23:45" }] }, new Date()),
    ).toBe(false);
  });
});
