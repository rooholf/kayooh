/**
 * T-11 (section 5.1) — bike state transition table.
 *
 * Every allowed transition (admin) succeeds and writes exactly one
 * `bike_events` row; every other pair throws 409 STATE_CONFLICT and leaves
 * the bike (and the custody trail) untouched.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "@repo/db";
import { db, bikes, bikeEvents, categories } from "@repo/db";
import { buildTestApp, seedAdmin, seedOutlet, truncateAll, type TestApp } from "./helpers.js";
import { sessionCookie } from "./helpers.js";

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

const ADMIN_EMAIL = "admin-t11@kayooh.test";
const ADMIN_PASSWORD = "admin-password-t11-x";

const ALLOWED: Array<[string, string]> = [
  ["available", "maintenance"],
  ["available", "unavailable"],
  ["maintenance", "available"],
  ["unavailable", "available"],
];

const STATES = ["available", "held", "reserved", "in_rental", "pending_inspection", "maintenance", "unavailable", "charging"] as const;

async function adminCookie(): Promise<string> {
  const admin = await seedAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
  const res = await t.app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: { email: admin.email, password: admin.password },
  });
  if (res.statusCode !== 200) throw new Error(`admin sign-in failed: ${res.statusCode} ${res.body}`);
  return sessionCookie(res.headers["set-cookie"]);
}

let outletCounter = 100;
async function seedBikeInState(state: string): Promise<{ bikeId: string; outletId: string }> {
  const code = `JMB-${String(outletCounter++).padStart(3, "0")}`;
  if (outletCounter > 999) outletCounter = 100;
  const outlet = await seedOutlet(code);
  await db.insert(categories).values({ code: "commuter", name: "Commuter" }).onConflictDoNothing();
  const [bike] = await db
    .insert(bikes)
    .values({
      assetTag: `${code}-COM-${Math.floor(Math.random() * 900 + 100)}`,
      category: "commuter",
      homeOutletId: outlet.outletId,
      currentOutletId: outlet.outletId,
      state: state as (typeof bikes.$inferSelect)["state"],
      ownerId: outlet.ownerId,
    })
    .returning({ id: bikes.id });
  return { bikeId: bike.id, outletId: outlet.outletId };
}

describe("T-11 (section 5.1): bike state transition table", () => {
  it("every allowed transition succeeds and writes exactly one bike_events row", async () => {
    const cookie = await adminCookie();
    for (const [from, to] of ALLOWED) {
      const { bikeId } = await seedBikeInState(from);
      const before = await db.select().from(bikeEvents).where(eq(bikeEvents.bikeId, bikeId));
      const res = await t.app.inject({
        method: "PATCH",
        url: `/api/v1/admin/bikes/${bikeId}/state`,
        headers: { cookie },
        payload: { to, reason: "t-11 allowed" },
      });
      expect(res.statusCode, `${from}->${to}`).toBe(200);
      const after = await db.select().from(bikeEvents).where(eq(bikeEvents.bikeId, bikeId));
      expect(after.length - before.length, `${from}->${to} event count`).toBe(1);
      const bike = (await db.select().from(bikes).where(eq(bikes.id, bikeId)))[0];
      expect(bike.state).toBe(to);
    }
  });

  it("every disallowed pair throws STATE_CONFLICT and leaves state + trail untouched", async () => {
    const cookie = await adminCookie();
    let checked = 0;
    for (const from of STATES) {
      for (const to of STATES) {
        if (ALLOWED.some(([f, t]) => f === from && t === to)) continue;
        // skip identical
        if (from === to) continue;
        const { bikeId } = await seedBikeInState(from);
        const beforeState = (await db.select().from(bikes).where(eq(bikes.id, bikeId)))[0].state;
        const beforeCount = (await db.select().from(bikeEvents).where(eq(bikeEvents.bikeId, bikeId))).length;
        const res = await t.app.inject({
          method: "PATCH",
          url: `/api/v1/admin/bikes/${bikeId}/state`,
          headers: { cookie },
          payload: { to, reason: "t-11 disallowed" },
        });
        expect(res.statusCode, `${from}->${to}`).toBe(409);
        expect((res.json() as { error: { code: string } }).error.code, `${from}->${to}`).toBe("STATE_CONFLICT");
        const afterState = (await db.select().from(bikes).where(eq(bikes.id, bikeId)))[0].state;
        const afterCount = (await db.select().from(bikeEvents).where(eq(bikeEvents.bikeId, bikeId))).length;
        expect(afterState).toBe(beforeState);
        expect(afterCount).toBe(beforeCount);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
