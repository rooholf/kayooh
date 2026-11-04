/**
 * Integration tests for FR-INV-02 (SKILL build_transactional_inventory_lock)
 * against the REAL Postgres cluster (NFR-09):
 *   - the FOR UPDATE lock serializes concurrent booking attempts: bicycle
 *     count (2) vs parallel requests (5) yields exactly 2 success / 3 SOLD_OUT
 *     (the NFR-02/T-01 property, at service level),
 *   - the hold transaction writes reservation + payment_intent + outbox,
 *   - pre-transaction contract errors map to the SRS 422 codes.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { and, eq, sql } from "@repo/db";
import {
  bikes,
  categories,
  db,
  deposits,
  outletCategories,
  outboxEvents,
  outlets,
  owners,
  paymentIntents,
  pricingRules,
  renters,
  reservations,
  users,
} from "@repo/db";
import { createReservationResponseSchema } from "@repo/contracts";
import { createReservationHold } from "../src/modules/inventory/index.js";
import { computeAvailability } from "../src/modules/inventory/index.js";
import { AppError } from "../src/lib/errors.js";
import type { Principal } from "../src/modules/identity/guards.js";
import type { CreateReservationBody } from "@repo/contracts";
import { truncateAll } from "./helpers.js";

/* ------------------------------------------------------------------ */
/* Seeds                                                                */
/* ------------------------------------------------------------------ */

async function seedRenter(opts?: { verificationStatus?: string; depositStatus?: string }): Promise<string> {
  const email = `renter.${Date.now()}.${Math.floor(Math.random()*1e6)}@renters.kayooh.test`;
  const phone = `+62812${String(Math.floor(Math.random()*1e8)).padStart(8, "0")}`;
  const [user] = await db
    .insert(users)
    .values({ email, emailVerified: false, name: "renter", role: "renter", phone })
    .returning({ id: users.id });
  const [renter] = await db
    .insert(renters)
    .values({
      userId: user.id,
      verificationStatus: opts?.verificationStatus ?? "verified",
      depositStatus: opts?.depositStatus ?? "held",
    })
    .returning({ id: renters.id });
  await db.insert(deposits).values({ renterId: renter.id, balanceIdr: 200_000n, status: "held" });
  return user.id;
}

interface SeedPartner {
  ownerId: string;
  outletId: string;
}

async function seedOffering(bikeCount: number): Promise<SeedPartner> {
  const [owner] = await db.insert(owners).values({ name: "owner-lock" }).returning({ id: owners.id });
  const [outlet] = await db
    .insert(outlets)
    .values({
      ownerId: owner.id,
      code: `JMB-0${Math.floor(Math.random() * 9) + 1}`,
      name: "Lock Test Outlet",
      address: "Jl. Inv02 No. 1, Jambi",
      lat: "-1.610000",
      lng: "103.613000",
      // Open every day 00:00-23:45 WIB (V-HOURS shape).
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
    active: true,
  });
  const tag = () => `JMB-0${Math.floor(Math.random() * 9) + 1}-TRK-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
  await db.insert(bikes).values(
    Array.from({ length: bikeCount }, () => ({
      ownerId: owner.id,
      assetTag: tag(),
      category: "commuter",
      homeOutletId: outlet.id,
      currentOutletId: outlet.id,
      state: "available" as const,
    })),
  );
  await db.insert(pricingRules).values({
    outletId: outlet.id,
    category: "commuter",
    rateIdr: 10_000n,
    effectiveFrom: new Date(Date.now() - 3_600_000),
  });
  return { ownerId: owner.id, outletId: outlet.id };
}

/** Next day, aligned to a 15-minute slot, whole seconds (V-TS output). */
function window(hhmmOffsetMinutes = 24 * 60): { startsAt: string; endsAt: string } {
  const aligned = Math.ceil((Date.now() + hhmmOffsetMinutes * 60_000) / 900_000) * 900_000;
  const startsAt = new Date(aligned);
  const endsAt = new Date(aligned + 60 * 60_000);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

function principalFor(userId: string): Principal {
  return {
    userId,
    role: "renter",
    ownerId: null,
    outletId: null,
    sessionId: "test-session",
    sessionCreatedAt: new Date(),
  };
}

function bodyFor(partner: SeedPartner, w: { startsAt: string; endsAt: string }): CreateReservationBody {
  return {
    outletId: partner.outletId,
    category: "commuter",
    startsAt: w.startsAt,
    endsAt: w.endsAt,
  };
}

/* ------------------------------------------------------------------ */
/* The lock                                                             */
/* ------------------------------------------------------------------ */

beforeEach(async () => {
  await truncateAll();
});

describe("FR-INV-02 create reservation (build_transactional_inventory_lock)", () => {
  it("computes availability for a fresh (outlet, category): bikes minus committed", async () => {
    const partner = await seedOffering(3);
    const available = await computeAvailability(db, {
      outletId: partner.outletId,
      category: "commuter",
      startsAt: new Date(window().startsAt),
      endsAt: new Date(window().endsAt),
    });
    expect(available).toBe(3);
  });

  it("creates a hold: reservation held + intent created + outbox, and responds through the contract", async () => {
    const partner = await seedOffering(2);
    const renterId = await seedRenter();
    const body = bodyFor(partner, window());

    const response = await createReservationHold(db, body, principalFor(renterId));
    // The route validates service output against the same contract — do the same here.
    const checked = createReservationResponseSchema.parse(response);
    expect(checked.reservation.status).toBe("held");
    expect(checked.reservation.finalIdr).toBe(10_000);
    expect(checked.reservation.expiresAt).not.toBeNull();
    expect(checked.price).toEqual({ priceIdr: 10_000, discountIdr: 0, finalIdr: 10_000 });
    expect(checked.paymentUrl).toMatch(/^https:\/\/pay\.fixtures\.jambi\.test\//);

    const [row] = await db
      .select()
      .from(reservations)
      .where(eq(reservations.id, checked.reservation.id));
    expect(row.status).toBe("held");
    expect(row.expiresAt).not.toBeNull();
    expect(row.cancelReason).toBeNull();

    const [intent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.reservationId, checked.reservation.id));
    expect(intent).toBeDefined();
    expect(intent.status).toBe("pending"); // fixture invoice stored
    expect(intent.amountIdr).toBe(10_000n);
    expect(intent.gatewayRef).toMatch(/^fixture-/);

    const [outbox] = await db
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.type, "reservation.held"), sql`${outboxEvents.payload}->>'reservationId' = ${checked.reservation.id}`));
    expect(outbox).toBeDefined();
    expect(outbox.dispatchedAt).toBeNull();
  });

  it("serializes concurrent attempts: 2 bikes, 5 parallel holds -> 2 success, 3 SOLD_OUT", async () => {
    const partner = await seedOffering(2);
    const renterId = await seedRenter();
    const body = bodyFor(partner, window(24 * 60 + 5));

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => createReservationHold(db, body, principalFor(renterId))),
    );
    const successes = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<unknown>[];
    const soldOuts = results.filter(
      (r): r is PromiseRejectedResult =>
        r.status === "rejected" && r.reason instanceof AppError && r.reason.code === "SOLD_OUT",
    );
    expect(successes).toHaveLength(2);
    expect(soldOuts).toHaveLength(3);

    // INV-2: never more reservations than bikes — never a silent over-sale.
    const [avail] = await Promise.all([
      computeAvailability(db, {
        outletId: partner.outletId,
        category: "commuter",
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
      }),
    ]);
    expect(avail).toBe(0);
  });

  it("maps pre-transaction contract failures to the SRS 422 codes", async () => {
    const partner = await seedOffering(1);

    await expect(
      createReservationHold(
        db,
        bodyFor(partner, window()),
        principalFor(await seedRenter({ verificationStatus: "pending" })),
      ),
    ).rejects.toMatchObject({ code: "VERIFICATION_REQUIRED" });

    await expect(
      createReservationHold(
        db,
        bodyFor(partner, window()),
        principalFor(await seedRenter({ depositStatus: "none" })),
      ),
    ).rejects.toMatchObject({ code: "DEPOSIT_REQUIRED" });

    // Unbookable window: less than min duration.
    const w = window();
    await expect(
      createReservationHold(
        db,
        { outletId: partner.outletId, category: "commuter", startsAt: w.startsAt, endsAt: w.startsAt },
        principalFor(await seedRenter()),
      ),
    ).rejects.toMatchObject({ code: "DURATION_OUT_OF_RANGE" });

    // Slot mis-alignment (27000000 = 7.5h -> seconds zero but minutes 30 fine; use :37).
    const notSlot = new Date(Math.floor((Date.now() + 24 * 3_600_000) / 60_000) * 60_000 + 37 * 60_000);
    await expect(
      createReservationHold(
        db,
        {
          outletId: partner.outletId,
          category: "commuter",
          startsAt: notSlot.toISOString(),
          endsAt: new Date(notSlot.getTime() + 3_600_000).toISOString(),
        },
        principalFor(await seedRenter()),
      ),
    ).rejects.toMatchObject({ code: "WINDOW_OUT_OF_RANGE" });
  });

  it("rejects a window outside the outlet's WIB opening hours (422 OUTSIDE_OPENING_HOURS)", async () => {
    const partner = await seedOffering(1);
    // Tighten daily hours to 09:00-17:00 WIB for this outlet.
    await db
      .update(outlets)
      .set({
        hours: {
          sun: [], mon: [{ open: "09:00", close: "17:00" }], tue: [{ open: "09:00", close: "17:00" }],
          wed: [{ open: "09:00", close: "17:00" }], thu: [{ open: "09:00", close: "17:00" }],
          fri: [{ open: "09:00", close: "17:00" }], sat: [{ open: "09:00", close: "17:00" }],
        },
      })
      .where(eq(outlets.id, partner.outletId));

    // 02:00 UTC = 09:00 WIB open edge; 04:00 UTC = 11:00 WIB -> on a closed day
    // the SUN rule must be empty. Pick a guaranteed weekday (tomorrow may be any
    // day) — this is why the window below lands inside mon-sat only if allowed.
    const renterId = await seedRenter();
    const w = window();
    const startsAt = new Date(w.startsAt);
    // Force a Sunday start regardless of "today".
    while (new Date(startsAt.getTime() + 7 * 3_600_000).getUTCDay() !== 0) {
      startsAt.setUTCDate(startsAt.getUTCDate() + 1);
    }
    startsAt.setUTCHours(2, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 3_600_000);
    // anything within 7 days advance (max_advance_days) is not guaranteed, but
    // day-offsets here stay <= 6 days beyond the 24h base.
    await expect(
      createReservationHold(
        db,
        { outletId: partner.outletId, category: "commuter", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
        principalFor(renterId),
      ),
    ).rejects.toMatchObject({ code: "OUTSIDE_OPENING_HOURS" });
  });
});
