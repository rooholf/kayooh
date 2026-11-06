/**
 * T-01 (NFR-02 / FR-INV-02 / INV-2) — concurrency script.
 *
 * Outlet seeded with 5 commuter bikes. Fire 50 parallel
 * `POST /api/v1/reservations` for a single time window. Expect exactly
 * 5 x 201 and 45 x 409 `SOLD_OUT`; no deadlock; availability 0 afterwards.
 *
 * Runs against the REAL Postgres cluster (NFR-09). Auth is exercised end to
 * end: the renter signs in via phone OTP (FR-ID-01) and the session cookie
 * is carried on every reservation request.
 */
import { describe, expect, it, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "@repo/db";
import { randomUUID } from "node:crypto";
import {
  bikes,
  categories,
  db,
  outletCategories,
  outlets,
  owners,
  pricingRules,
  renters,
  users,
} from "@repo/db";
import { computeAvailability } from "../src/modules/inventory/index.js";
import {
  buildTestApp,
  sessionCookie,
  truncateAll,
  type TestApp,
} from "./helpers.js";

/* ------------------------------------------------------------------ */
/* Seeds                                                               */
/* ------------------------------------------------------------------ */

interface SeedPartner {
  ownerId: string;
  outletId: string;
}

async function seedOffering(bikeCount: number): Promise<SeedPartner> {
  const [owner] = await db.insert(owners).values({ name: "owner-t01" }).returning({ id: owners.id });
  const [outlet] = await db
    .insert(outlets)
    .values({
      ownerId: owner.id,
      code: `JMB-T01-${Math.floor(Math.random() * 1e6)}`,
      name: "T-01 Outlet",
      address: "Jl. T01 No. 1, Jambi",
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

  await db
    .insert(categories)
    .values([{ code: "commuter", name: "Commuter" }])
    .onConflictDoNothing();

  await db.insert(outletCategories).values({
    outletId: outlet.id,
    ownerId: owner.id,
    category: "commuter",
    safetyBuffer: 0,
    active: true,
  });

  await db.insert(bikes).values(
    Array.from({ length: bikeCount }, (_, i) => ({
      ownerId: owner.id,
      assetTag: `T01-${outlet.id.slice(0, 8)}-${i}-${randomUUID().slice(0, 8)}`,
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
function windowFor(): { startsAt: string; endsAt: string } {
  const aligned = Math.ceil((Date.now() + 24 * 60 * 60_000) / 900_000) * 900_000;
  const startsAt = new Date(aligned);
  const endsAt = new Date(aligned + 60 * 60_000);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

const PHONE = "081234567890";

/** Unique local phone per test (8-digit subscriber) to dodge the OTP rate limiter. */
function newPhone(): string {
  return `0812${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`;
}

/** "+62" + local digits without the leading 0. */
function canonicalPhone(phone: string): string {
  return `+62${phone.slice(1)}`;
}

/** FR-ID-01: sign the renter in end-to-end, then promote the profile to
 *  `verified` (starts `not_started`). Returns the session cookie. */
async function signInVerifiedRenter(t: TestApp, phone = PHONE): Promise<string> {
  const canonical = canonicalPhone(phone);
  const send = await t.app.inject({
    method: "POST",
    url: "/api/auth/phone-number/send-otp",
    payload: { phoneNumber: phone },
  });
  expect(send.statusCode).toBe(200);
  const code = t.notifications.lastOtp(canonical);
  const verify = await t.app.inject({
    method: "POST",
    url: "/api/auth/phone-number/verify",
    payload: { phoneNumber: phone, code },
  });
  expect(verify.statusCode).toBe(200);
  const cookie = sessionCookie(verify.headers["set-cookie"]);

  const [user] = await db.select().from(users).where(eq(users.phoneNumber, canonical));
  expect(user).toBeDefined();
  await db.update(renters).set({ verificationStatus: "verified" }).where(eq(renters.userId, user.id));
  return cookie;
}

function reservationBody(partner: SeedPartner, w: { startsAt: string; endsAt: string }, quantity?: number) {
  return {
    outletId: partner.outletId,
    category: "commuter",
    startsAt: w.startsAt,
    endsAt: w.endsAt,
    ...(quantity === undefined ? {} : { quantity }),
  };
}

/* ------------------------------------------------------------------ */
/* Test                                                                */
/* ------------------------------------------------------------------ */

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

describe("T-01 (NFR-02): 50 parallel reservations, 5 bikes", () => {
  it("yields exactly 5 x 201 and 45 x 409 SOLD_OUT; availability 0", async () => {
    const partner = await seedOffering(5);
    const cookie = await signInVerifiedRenter(t);

    const w = windowFor();
    const body = reservationBody(partner, w);

    const keys = Array.from({ length: 50 }, () => randomUUID());

    const results = await Promise.all(
      keys.map((key) =>
        t.app.inject({
          method: "POST",
          url: "/api/v1/reservations",
          headers: { cookie, "idempotency-key": key },
          payload: body,
        }),
      ),
    );

    const successes = results.filter((r) => r.statusCode === 201);
    const soldOuts = results.filter(
      (r) => r.statusCode === 409 && r.json()?.error?.code === "SOLD_OUT",
    );

    const other = results.filter(
      (r) => r.statusCode !== 201 && !(r.statusCode === 409 && r.json()?.error?.code === "SOLD_OUT"),
    );

    expect(successes).toHaveLength(5);
    expect(soldOuts).toHaveLength(45);
    expect(other).toHaveLength(0);

    const avail = await computeAvailability(db, {
      outletId: partner.outletId,
      category: "commuter",
      startsAt: new Date(w.startsAt),
      endsAt: new Date(w.endsAt),
    });
    expect(avail).toBe(0);
  }, 60_000);

  it("commits `quantity` bikes: 5 bikes, q=3 then q=3 fails and q=2 succeeds", async () => {
    const partner = await seedOffering(5);
    const cookie = await signInVerifiedRenter(t, newPhone());
    const w = windowFor();

    const post = (quantity: number, key = randomUUID()) =>
      t.app.inject({
        method: "POST",
        url: "/api/v1/reservations",
        headers: { cookie, "idempotency-key": key },
        payload: reservationBody(partner, w, quantity),
      });

    // FR-INV-01/02: one reservation commits `quantity` bikes, not one.
    const first = await post(3);
    expect(first.statusCode).toBe(201);
    expect(first.json()?.reservation?.quantity).toBe(3);

    const avail = await computeAvailability(db, {
      outletId: partner.outletId,
      category: "commuter",
      startsAt: new Date(w.startsAt),
      endsAt: new Date(w.endsAt),
    });
    expect(avail).toBe(2); // 5 bikes - 3 committed

    const tooMany = await post(3);
    expect(tooMany.statusCode).toBe(409);
    expect(tooMany.json()?.error?.code).toBe("SOLD_OUT");

    const exact = await post(2);
    expect(exact.statusCode).toBe(201);
    expect(exact.json()?.reservation?.quantity).toBe(2);
  }, 60_000);
});
