/**
 * T-12 (INV-6) — UPDATE and DELETE on every append-only table raise an
 * exception ("INV-6 VIOLATION").
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "@repo/db";
import { db, pool, bikes, outlets, owners, users, renters, verificationRequests, categories } from "@repo/db";
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

async function expectViolation(fn: () => Promise<unknown>): Promise<void> {
  let thrown: unknown = null;
  try {
    await fn();
  } catch (e) {
    thrown = e;
  }
  // Either the driver throws, or (for HTTP) a 500. Here we run raw SQL via
  // pool, so expect a thrown error mentioning INV-6.
  expect(thrown).not.toBeNull();
  const msg = String((thrown as { message?: string })?.message ?? thrown);
  expect(msg.toUpperCase()).toContain("INV-6");
}

describe("T-12 (INV-6): append-only tables reject UPDATE and DELETE", () => {
  it("bike_events", async () => {
    const outlet = await seedOutlet("JMB-121");
    await db.insert(categories).values({ code: "commuter", name: "Commuter" }).onConflictDoNothing();
    const [bike] = await db
      .insert(bikes)
      .values({
        assetTag: "JMB-121-COM-001",
        category: "commuter",
        homeOutletId: outlet.outletId,
        currentOutletId: outlet.outletId,
        state: "available",
        ownerId: outlet.ownerId,
      })
      .returning({ id: bikes.id });
    await db.execute(sql`
      INSERT INTO bike_events (bike_id, owner_id, type, to_state, outlet_id, occurred_at)
      VALUES (${bike.id}, ${outlet.ownerId}, 'registered', 'available', ${outlet.outletId}, now())
    `);
    await expectViolation(async () => {
      await db.execute(sql`UPDATE bike_events SET payload = '{"x":1}'::jsonb;`);
    });
    await expectViolation(async () => {
      await db.execute(sql`DELETE FROM bike_events;`);
    });
  });

  it("audit_log", async () => {
    await db.execute(sql`
      INSERT INTO audit_log (actor_role, action, entity) VALUES ('system', 't-12', 'test')
    `);
    await expectViolation(async () => {
      await db.execute(sql`UPDATE audit_log SET action = 'x';`);
    });
    await expectViolation(async () => {
      await db.execute(sql`DELETE FROM audit_log;`);
    });
  });

  it("scan_events", async () => {
    const outlet = await seedOutlet("JMB-122");
    const staff = await seedOwner("staff-t12@kayooh.test"); // placeholder owner for outlet
    void staff;
    await db.execute(sql`
      INSERT INTO scan_events (client_event_id, staff_id, outlet_id, type, occurred_at, status)
      VALUES (gen_random_uuid(), NULL, ${outlet.outletId}, 'checkout', now(), 'applied')
    `);
    // Immutable column update must raise.
    await expectViolation(async () => {
      await db.execute(sql`UPDATE scan_events SET payload = '{"x":1}'::jsonb;`);
    });
    await expectViolation(async () => {
      await db.execute(sql`DELETE FROM scan_events;`);
    });
  });

  it("payment_webhook_events", async () => {
    await db.execute(sql`
      INSERT INTO payment_webhook_events (provider, event_id, raw) VALUES ('xendit', 'evt-t12', '{}'::jsonb)
    `);
    await expectViolation(async () => {
      await db.execute(sql`UPDATE payment_webhook_events SET raw = '{"x":1}'::jsonb;`);
    });
    await expectViolation(async () => {
      await db.execute(sql`DELETE FROM payment_webhook_events;`);
    });
  });

  it("id_document_views", async () => {
    const owner = await seedOwner("owner-t12b@kayooh.test");
    const outlet = await seedOutletAs(owner.ownerId, "JMB-123");
    void outlet;
    const renter = await seedRenterRow(owner.ownerId);
    const vr = await db.execute(sql`
      INSERT INTO verification_requests (renter_id, provider, document_type) VALUES (${renter}, 'manual_review', 'ktp') RETURNING id
    `);
    const vrId = (vr.rows as Array<{ id: string }>)[0].id;
    await db.execute(sql`
      INSERT INTO id_document_views (verification_request_id) VALUES (${vrId})
    `);
    await expectViolation(async () => {
      await db.execute(sql`UPDATE id_document_views SET viewed_at = now();`);
    });
    await expectViolation(async () => {
      await db.execute(sql`DELETE FROM id_document_views;`);
    });
  });
});

async function seedOutletAs(ownerId: string, code: string): Promise<string> {
  const [outlet] = await db
    .insert(outlets)
    .values({
      ownerId,
      code,
      name: `Outlet ${code}`,
      address: "Jl. Test",
      lat: "-1.610000",
      lng: "103.613000",
      hours: { open: "08:00", close: "21:00" },
    })
    .returning({ id: outlets.id });
  return outlet.id;
}

async function seedRenterRow(_ownerId: string): Promise<string> {
  const email = `renter-t12-${Math.random()}@kayooh.test`;
  const [user] = await db.insert(users).values({ email, emailVerified: true, name: "renter", role: "renter" }).returning({ id: users.id });
  const [renter] = await db.insert(renters).values({ userId: user.id }).returning({ id: renters.id });
  return renter.id;
}
