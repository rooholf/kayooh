/**
 * T-14 (NFR-11) — PR C: boundary values for staff event and health-sync
 * schemas. Outer event fields (clientEventId, occurredAt) plus per-type payload
 * constraints (bikeAssetTag, photoKeys, voucherToken, etc.) and health-sync
 * (sentAt, physicalCounts).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildTestApp, truncateAll, type TestApp } from "./helpers.js";
import { seedOffering, seedStaff, staffSessionCookie, seedRenter, nextWindow, seedConfirmedReservation } from "./staff.helpers.js";
import { signVoucher } from "../src/lib/voucher.js";

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

function expectBoundary(res: { statusCode: number; body: string }, path: string): void {
  expect(res.statusCode).toBe(400);
  const body = JSON.parse(res.body) as { error: { code: string; details?: Array<{ path: string }> } };
  expect(body.error.code).toBe("VALIDATION_ERROR");
  expect(body.error.details?.some((d) => d.path === path || d.path?.endsWith(path))).toBe(true);
}

describe("T-14 (PR C): staff event outer boundary values", () => {
  it("clientEventId malformed (not UUID v4) -> 400 path clientEventId", async () => {
    const offering = await seedOffering(1);
    const staff = await seedStaff("staff-t14c@kayooh.test", "staff-password-t14c-x", offering.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie },
      payload: { clientEventId: "not-a-uuid", occurredAt: "2026-11-13T10:00:00Z", type: "checkin", payload: { bikeAssetTag: "JMB-001-COM-000" } },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("occurredAt missing Z (V-TS) -> 400 path occurredAt", async () => {
    const offering = await seedOffering(1);
    const staff = await seedStaff("staff-t14c2@kayooh.test", "staff-password-t14c2-x", offering.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie },
      payload: { clientEventId: randomUUID(), occurredAt: "2026-11-13T10:00:00", type: "checkin", payload: { bikeAssetTag: "JMB-001-COM-000" } },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("type invalid enum -> 400 path type", async () => {
    const offering = await seedOffering(1);
    const staff = await seedStaff("staff-t14c3@kayooh.test", "staff-password-t14c3-x", offering.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie },
      payload: { clientEventId: randomUUID(), occurredAt: "2026-11-13T10:00:00Z", type: "foo", payload: {} },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("unknown top-level field (strictness) -> 400", async () => {
    const offering = await seedOffering(1);
    const staff = await seedStaff("staff-t14c4@kayooh.test", "staff-password-t14c4-x", offering.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie },
      payload: { clientEventId: randomUUID(), occurredAt: "2026-11-13T10:00:00Z", type: "checkin", payload: { bikeAssetTag: "JMB-001-COM-000" }, foo: "bar" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("T-14 (PR C): checkout payload boundary values", () => {
  it("voucherToken too short (min 8) -> 400 path voucherToken", async () => {
    const offering = await seedOffering(1);
    const staff = await seedStaff("staff-t14c5@kayooh.test", "staff-password-t14c5-x", offering.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie },
      payload: {
        clientEventId: randomUUID(),
        occurredAt: "2026-11-13T10:00:00Z",
        type: "checkout",
        payload: {
          voucherToken: "short",
          bikeAssetTags: ["JMB-001-COM-000"],
          checklist: { frame: "ok", brakes: "ok", tires: "ok", chain: "ok", saddle: "ok", handlebar_gears: "ok" },
          photoKeys: [],
          collateral: { type: "ktp", reference: "x" },
        },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("bikeAssetTags empty (min 1) -> 400 path bikeAssetTags", async () => {
    const offering = await seedOffering(1);
    const staff = await seedStaff("staff-t14c6@kayooh.test", "staff-password-t14c6-x", offering.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie },
      payload: {
        clientEventId: randomUUID(),
        occurredAt: "2026-11-13T10:00:00Z",
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
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("photoKeys 65 (max 64) -> 400 path photoKeys", async () => {
    const offering = await seedOffering(1);
    const staff = await seedStaff("staff-t14c7@kayooh.test", "staff-password-t14c7-x", offering.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie },
      payload: {
        clientEventId: randomUUID(),
        occurredAt: "2026-11-13T10:00:00Z",
        type: "checkout",
        payload: {
          voucherToken: "a".repeat(16),
          bikeAssetTags: ["JMB-001-COM-000"],
          checklist: { frame: "ok", brakes: "ok", tires: "ok", chain: "ok", saddle: "ok", handlebar_gears: "ok" },
          photoKeys: Array.from({ length: 65 }, () => "uploads/checklist/00000000-0000-0000-0000-000000000000.jpg"),
          collateral: { type: "ktp", reference: "x" },
        },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("collateral missing -> 400 (COLLATERAL_REQUIRED)", async () => {
    const offering = await seedOffering(1);
    const renter = await seedRenter();
    const w = nextWindow();
    const confirmed = await seedConfirmedReservation({ userId: renter.userId, outletId: offering.outletId, category: "commuter", window: w });
    const staff = await seedStaff("staff-t14c8@kayooh.test", "staff-password-t14c8-x", offering.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const occurredAt = w.startsAt;
    const voucherToken = signVoucher({ reservationId: confirmed.reservationId, expiresAt: new Date(new Date(occurredAt).getTime() + 15 * 60_000) });
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie },
      payload: {
        clientEventId: randomUUID(),
        occurredAt,
        type: "checkout",
        payload: {
          voucherToken,
          bikeAssetTags: [offering.bikeTags[0]],
          checklist: { frame: "ok", brakes: "ok", tires: "ok", chain: "ok", saddle: "ok", handlebar_gears: "ok" },
          photoKeys: ["uploads/checklist/00000000-0000-0000-0000-000000000000.jpg"],
          balanceCollection: { amountIdr: Number(confirmed.finalIdr - confirmed.dpIdr), method: "cash" },
        },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.message).toBe("COLLATERAL_REQUIRED");
  });
});

describe("T-14 (PR C): checkin/inspection boundary values", () => {
  it("checkin missing bikeAssetTag -> 400 path bikeAssetTag", async () => {
    const offering = await seedOffering(1);
    const staff = await seedStaff("staff-t14c9@kayooh.test", "staff-password-t14c9-x", offering.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie },
      payload: { clientEventId: randomUUID(), occurredAt: "2026-11-13T10:00:00Z", type: "checkin", payload: {} },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("inspection missing rentalId -> 400 path rentalId", async () => {
    const offering = await seedOffering(1);
    const staff = await seedStaff("staff-t14c10@kayooh.test", "staff-password-t14c10-x", offering.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie },
      payload: { clientEventId: randomUUID(), occurredAt: "2026-11-13T10:00:00Z", type: "inspection", payload: { result: "pass", checklist: { frame: "ok", brakes: "ok", tires: "ok", chain: "ok", saddle: "ok", handlebar_gears: "ok" }, photoKeys: ["uploads/checklist/00000000-0000-0000-0000-000000000000.jpg"] } },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("inspection result invalid enum -> 400 path result", async () => {
    const offering = await seedOffering(1);
    const staff = await seedStaff("staff-t14c11@kayooh.test", "staff-password-t14c11-x", offering.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie },
      payload: { clientEventId: randomUUID(), occurredAt: "2026-11-13T10:00:00Z", type: "inspection", payload: { rentalId: "11111111-1111-4111-8111-111111111111", result: "foo", checklist: { frame: "ok", brakes: "ok", tires: "ok", chain: "ok", saddle: "ok", handlebar_gears: "ok" }, photoKeys: ["uploads/checklist/00000000-0000-0000-0000-000000000000.jpg"] } },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("inspection photoKeys 65 (max 64) -> 400 path photoKeys", async () => {
    const offering = await seedOffering(1);
    const staff = await seedStaff("staff-t14c12@kayooh.test", "staff-password-t14c12-x", offering.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie },
      payload: { clientEventId: randomUUID(), occurredAt: "2026-11-13T10:00:00Z", type: "inspection", payload: { rentalId: "11111111-1111-4111-8111-111111111111", result: "pass", checklist: { frame: "ok", brakes: "ok", tires: "ok", chain: "ok", saddle: "ok", handlebar_gears: "ok" }, photoKeys: Array.from({ length: 65 }, () => "uploads/checklist/00000000-0000-0000-0000-000000000000.jpg") } },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("T-14 (PR C): health-sync boundary values", () => {
  it("sentAt missing Z (V-TS) -> 400 path sentAt", async () => {
    const offering = await seedOffering(1);
    const staff = await seedStaff("staff-t14c13@kayooh.test", "staff-password-t14c13-x", offering.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/health-sync",
      headers: { cookie },
      payload: { sentAt: "2026-11-13T10:00:00" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("physicalCounts negative -> 400", async () => {
    const offering = await seedOffering(1);
    const staff = await seedStaff("staff-t14c14@kayooh.test", "staff-password-t14c14-x", offering.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/health-sync",
      headers: { cookie },
      payload: { sentAt: "2026-11-13T10:00:00Z", physicalCounts: { commuter: -1 } },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it("unknown field (strictness) on health-sync -> 400", async () => {
    const offering = await seedOffering(1);
    const staff = await seedStaff("staff-t14c15@kayooh.test", "staff-password-t14c15-x", offering.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/health-sync",
      headers: { cookie },
      payload: { sentAt: "2026-11-13T10:00:00Z", foo: "bar" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("VALIDATION_ERROR");
  });
});
