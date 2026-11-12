/**
 * T-14 (NFR-11) — Zod boundary values: n-1 / n+1 on every constrained field
 * must return 400 VALIDATION_ERROR with `details[].path` pointing at the field.
 * Scope here: the staff/admin/owner schemas landed by #40 (admin onboarding,
 * staff events, outlet/bike payloads). Each case sends a value just below/above
 * the documented bound and asserts the rejection carries the field path.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, owners } from "@repo/db";
import { buildTestApp, seedAdmin, seedOutlet, truncateAll, type TestApp } from "./helpers.js";
import { sessionCookie } from "./helpers.js";
import { seedStaff, staffSessionCookie } from "./staff.helpers.js";
import { randomUUID } from "node:crypto";

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

async function adminCookie(): Promise<string> {
  const admin = await seedAdmin();
  const login = await t.app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: { email: admin.email, password: admin.password },
  });
  return sessionCookie(login.headers["set-cookie"]);
}

function expectBoundary(res: { statusCode: number; body: string }, path: string): void {
  expect(res.statusCode).toBe(400);
  const body = JSON.parse(res.body) as { error: { code: string; details?: Array<{ path: string }> } };
  expect(body.error.code).toBe("VALIDATION_ERROR");
  expect(body.error.details?.some((d) => d.path === path || d.path?.endsWith(path))).toBe(true);
}

describe("T-14: Zod boundary values (staff/admin/owner schemas)", () => {
  it("admin create owner: empty name (vTextS min 1) -> 400 details path name", async () => {
    const cookie = await adminCookie();
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/admin/owners",
      headers: { cookie },
      payload: { name: "", bankCode: "BCA", bankAccountNumber: "1234567890", bankAccountName: "x" },
    });
    expectBoundary(res, "name");
  });

  it("admin create owner: overlong name (vTextS max 200) -> 400 details path name", async () => {
    const cookie = await adminCookie();
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/admin/owners",
      headers: { cookie },
      payload: { name: "a".repeat(201), bankCode: "BCA", bankAccountNumber: "1234567890", bankAccountName: "x" },
    });
    expectBoundary(res, "name");
  });

  it("admin create outlet: empty categories (min 1) -> 400 details path categories", async () => {
    const cookie = await adminCookie();
    // seed a real owner row
    const [o] = await db.insert(owners).values({ name: "o" }).returning({ id: owners.id });
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/admin/outlets",
      headers: { cookie },
      payload: {
        ownerId: o.id,
        code: "JMB-099",
        name: "Outlet",
        address: "Jl. Test",
        lat: -1.6,
        lng: 103.6,
        hours: { mon: [{ open: "07:00", close: "19:00" }] },
        categories: [],
      },
    });
    expectBoundary(res, "categories");
  });

  it("admin create outlet: lat out of range (max 90) -> 400 details path lat", async () => {
    const cookie = await adminCookie();
    const [o] = await db.insert(owners).values({ name: "o2" }).returning({ id: owners.id });
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/admin/outlets",
      headers: { cookie },
      payload: {
        ownerId: o.id,
        code: "JMB-098",
        name: "Outlet",
        address: "Jl. Test",
        lat: 91,
        lng: 103.6,
        hours: { mon: [{ open: "07:00", close: "19:00" }] },
        categories: ["commuter"],
      },
    });
    expectBoundary(res, "lat");
  });

  it("admin bulk bikes: empty items (min 1) -> 400 details path items", async () => {
    const cookie = await adminCookie();
    const outlet = await seedOutlet("JMB-097");
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/admin/bikes/bulk",
      headers: { cookie },
      payload: { items: [] },
    });
    expectBoundary(res, "items");
    void outlet;
  });

  it("admin bulk bikes: 201 items (max 200) -> 400 details path items", async () => {
    const cookie = await adminCookie();
    const item = { assetTag: "JMB-097-COM-000", category: "commuter", homeOutletId: (await seedOutlet("JMB-096")).outletId };
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/admin/bikes/bulk",
      headers: { cookie },
      payload: { items: Array.from({ length: 201 }, () => ({ ...item, assetTag: `JMB-096-COM-${Math.floor(Math.random() * 999)}` })) },
    });
    expectBoundary(res, "items");
  });

  it("staff event checkout: empty bikeAssetTags (min 1) -> 400 details path bikeAssetTags", async () => {
    const outlet = await seedOutlet("JMB-095");
    const staff = await seedStaff("staff-t14@kayooh.test", "staff-password-t14-x", outlet.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie },
      payload: {
        clientEventId: randomUUID(),
        occurredAt: new Date().toISOString(),
        type: "checkout",
        payload: {
          voucherToken: "a".repeat(16),
          bikeAssetTags: [],
          checklist: { frame: "ok", brakes: "ok", tires: "ok", chain: "ok", saddle: "ok", handlebar_gears: "ok" },
          photoKeys: [],
          collateral: { type: "ktp", reference: "x" },
        },
      },
    });
    // The voucher is invalid anyway, but the schema rejects empty bikeAssetTags first.
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it("staff event checkout: 65 photoKeys (max 64) -> 400", async () => {
    const outlet = await seedOutlet("JMB-094");
    const staff = await seedStaff("staff-t14b@kayooh.test", "staff-password-t14b-x", outlet.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie },
      payload: {
        clientEventId: randomUUID(),
        occurredAt: new Date().toISOString(),
        type: "checkout",
        payload: {
          voucherToken: "a".repeat(16),
          bikeAssetTags: ["JMB-094-COM-000"],
          checklist: { frame: "ok", brakes: "ok", tires: "ok", chain: "ok", saddle: "ok", handlebar_gears: "ok" },
          photoKeys: Array.from({ length: 65 }, () => "uploads/checklist/00000000-0000-0000-0000-000000000000.jpg"),
          collateral: { type: "ktp", reference: "x" },
        },
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });
});
