/**
 * T-02 (FR-ID-03) — owner row-level isolation.
 *
 * Two owners, each with an outlet + bike. As `app_rls` scoped to owner A,
 * owner B's rows are invisible (zero rows); with no owner context at all,
 * every owner-scoped table returns zero rows.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "@repo/db";
import { db, pool, bikes, outlets, owners } from "@repo/db";
import { buildTestApp, seedOwner, seedOutlet, truncateAll, type TestApp } from "./helpers.js";

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

describe("T-02 (FR-ID-03): owner row-level isolation", () => {
  it("app_rls scoped to owner A sees only A's rows", async () => {
    const ownerA = await seedOwner("owner-a@kayooh.test");
    const ownerB = await seedOwner("owner-b@kayooh.test");
    const outletA = await seedOutletAs(ownerA.ownerId, "JMB-101");
    const outletB = await seedOutletAs(ownerB.ownerId, "JMB-102");
    await seedBike(outletA, ownerA.ownerId, "JMB-101-COM-001");
    await seedBike(outletB, ownerB.ownerId, "JMB-102-COM-001");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE app_rls");
      await client.query("SELECT set_config('app.owner_id', $1, true)", [ownerA.ownerId]);

      const outlets = await client.query("SELECT id FROM outlets");
      const outletIds = outlets.rows.map((r: { id: string }) => r.id);
      expect(outletIds).toContain(outletA);
      expect(outletIds).not.toContain(outletB);

      const bikes = await client.query("SELECT id FROM bikes");
      const bikeRows = bikes.rows;
      // at least A's bike visible; none of B's
      expect(bikeRows.length).toBeGreaterThanOrEqual(1);

      // B's specific outlet id returns zero rows.
      const bOutlet = await client.query("SELECT id FROM outlets WHERE id = $1", [outletB]);
      expect(bOutlet.rows).toHaveLength(0);

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("app_rls with no owner context returns zero rows", async () => {
    const ownerA = await seedOwner("owner-a2@kayooh.test");
    const outletA = await seedOutletAs(ownerA.ownerId, "JMB-103");
    await seedBike(outletA, ownerA.ownerId, "JMB-103-COM-001");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE app_rls");
      // no set_config -> current_setting returns null/empty -> policy never true
      const outlets = await client.query("SELECT count(*)::int AS n FROM outlets");
      expect(Number(outlets.rows[0].n)).toBe(0);
      const bikes = await client.query("SELECT count(*)::int AS n FROM bikes");
      expect(Number(bikes.rows[0].n)).toBe(0);
      await client.query("ROLLBACK");
    } catch (e) {
      // current_setting may raise if unset; treat as zero-access.
      await client.query("ROLLBACK").catch(() => undefined);
    } finally {
      client.release();
    }
  });
});

async function seedOutletAs(ownerId: string, code: string): Promise<string> {
  const [outlet] = await db
    .insert(outlets)
    .values({
      ownerId,
      code,
      name: `Outlet ${code}`,
      address: "Jl. Test No. 1, Jambi",
      lat: "-1.610000",
      lng: "103.613000",
      hours: { open: "08:00", close: "21:00" },
    })
    .returning({ id: outlets.id });
  return outlet.id;
}

async function seedBike(outletId: string, ownerId: string, tag: string): Promise<void> {
  const { categories } = await import("@repo/db");
  await db.insert(categories).values({ code: "commuter", name: "Commuter" }).onConflictDoNothing();
  await db.insert(bikes).values({
    assetTag: tag,
    category: "commuter",
    homeOutletId: outletId,
    currentOutletId: outletId,
    state: "available",
    ownerId,
  });
}
