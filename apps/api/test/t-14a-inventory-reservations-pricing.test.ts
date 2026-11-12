/**
 * T-14 (NFR-11) — PR A: boundary values for the inventory / reservation /
 * pricing schemas (`POST /api/v1/reservations`, `POST /api/v1/pricing/quote`).
 * Each case sends a value just below/above the documented bound (or an unknown
 * field, exercising `.strict()`) and asserts 400 `VALIDATION_ERROR` with
 * `details[].path` pointing at the offending field.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildTestApp, truncateAll, type TestApp } from "./helpers.js";

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

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const VALID_TS = "2026-11-13T10:00:00Z";
const VALID_BODY = {
  outletId: VALID_UUID,
  category: "commuter",
  startsAt: VALID_TS,
  endsAt: "2026-11-13T11:00:00Z",
  contactPhone: "+6281234567890",
};

describe("T-14 (PR A): /reservations boundary values", () => {
  it("missing outletId -> 400 path outletId", async () => {
    const { outletId: _o, ...rest } = VALID_BODY;
    const res = await t.app.inject({ method: "POST", url: "/api/v1/reservations", headers: { "Idempotency-Key": randomUUID() }, payload: rest });
    expectBoundary(res, "outletId");
  });

  it("malformed outletId (not UUID) -> 400 path outletId", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/reservations", headers: { "Idempotency-Key": randomUUID() }, payload: { ...VALID_BODY, outletId: "not-a-uuid" } });
    expectBoundary(res, "outletId");
  });

  it("category too short (V-CAT min 2) -> 400 path category", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/reservations", headers: { "Idempotency-Key": randomUUID() }, payload: { ...VALID_BODY, category: "a" } });
    expectBoundary(res, "category");
  });

  it("category too long (V-CAT max 16) -> 400 path category", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/reservations", headers: { "Idempotency-Key": randomUUID() }, payload: { ...VALID_BODY, category: "a".repeat(17) } });
    expectBoundary(res, "category");
  });

  it("category with uppercase (V-CAT lowercase only) -> 400 path category", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/reservations", headers: { "Idempotency-Key": randomUUID() }, payload: { ...VALID_BODY, category: "Commuter" } });
    expectBoundary(res, "category");
  });

  it("startsAt missing trailing Z (V-TS) -> 400 path startsAt", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/reservations", headers: { "Idempotency-Key": randomUUID() }, payload: { ...VALID_BODY, startsAt: "2026-11-13T10:00:00" } });
    expectBoundary(res, "startsAt");
  });

  it("endsAt missing trailing Z (V-TS) -> 400 path endsAt", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/reservations", headers: { "Idempotency-Key": randomUUID() }, payload: { ...VALID_BODY, endsAt: "2026-11-13T11:00:00+07:00" } });
    expectBoundary(res, "endsAt");
  });

  it("quantity 0 (V-QTY min 1) -> 400 path quantity", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/reservations", headers: { "Idempotency-Key": randomUUID() }, payload: { ...VALID_BODY, quantity: 0 } });
    expectBoundary(res, "quantity");
  });

  it("quantity 6 (V-QTY max 5) -> 400 path quantity", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/reservations", headers: { "Idempotency-Key": randomUUID() }, payload: { ...VALID_BODY, quantity: 6 } });
    expectBoundary(res, "quantity");
  });

  it("quantity float (V-QTY integer) -> 400 path quantity", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/reservations", headers: { "Idempotency-Key": randomUUID() }, payload: { ...VALID_BODY, quantity: 1.5 } });
    expectBoundary(res, "quantity");
  });

  it("promoCode too short (V-PROMO min 4) -> 400 path promoCode", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/reservations", headers: { "Idempotency-Key": randomUUID() }, payload: { ...VALID_BODY, promoCode: "ABC" } });
    expectBoundary(res, "promoCode");
  });

  it("promoCode too long (V-PROMO max 16) -> 400 path promoCode", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/reservations", headers: { "Idempotency-Key": randomUUID() }, payload: { ...VALID_BODY, promoCode: "A".repeat(17) } });
    expectBoundary(res, "promoCode");
  });

  it("contactPhone invalid (V-PHONE) -> 400 path contactPhone", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/reservations", headers: { "Idempotency-Key": randomUUID() }, payload: { ...VALID_BODY, contactPhone: "123" } });
    expectBoundary(res, "contactPhone");
  });

  it("unknown field (strictness) -> 400", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/reservations", headers: { "Idempotency-Key": randomUUID() }, payload: { ...VALID_BODY, foo: "bar" } });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("missing Idempotency-Key header -> 400", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/reservations", payload: VALID_BODY });
    // Idempotency middleware rejects missing key (400).
    expect(res.statusCode).toBe(400);
  });
});

describe("T-14 (PR A): /pricing/quote boundary values", () => {
  const QUOTE_BODY = {
    outletId: VALID_UUID,
    category: "commuter",
    startsAt: VALID_TS,
    endsAt: "2026-11-13T11:00:00Z",
  };

  it("missing outletId -> 400 path outletId", async () => {
    const { outletId: _o, ...rest } = QUOTE_BODY;
    const res = await t.app.inject({ method: "POST", url: "/api/v1/pricing/quote", payload: rest });
    expectBoundary(res, "outletId");
  });

  it("malformed outletId -> 400 path outletId", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/pricing/quote", payload: { ...QUOTE_BODY, outletId: "zzz" } });
    expectBoundary(res, "outletId");
  });

  it("category too short -> 400 path category", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/pricing/quote", payload: { ...QUOTE_BODY, category: "a" } });
    expectBoundary(res, "category");
  });

  it("startsAt missing Z -> 400 path startsAt", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/pricing/quote", payload: { ...QUOTE_BODY, startsAt: "2026-11-13T10:00:00" } });
    expectBoundary(res, "startsAt");
  });

  it("endsAt missing Z -> 400 path endsAt", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/pricing/quote", payload: { ...QUOTE_BODY, endsAt: "2026-11-13T11:00:00+07:00" } });
    expectBoundary(res, "endsAt");
  });

  it("quantity 0 (V-QTY min 1) -> 400 path quantity", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/pricing/quote", payload: { ...QUOTE_BODY, quantity: 0 } });
    expectBoundary(res, "quantity");
  });

  it("quantity 6 (V-QTY max 5) -> 400 path quantity", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/pricing/quote", payload: { ...QUOTE_BODY, quantity: 6 } });
    expectBoundary(res, "quantity");
  });

  it("promoCode too short (V-PROMO min 4) -> 400 path promoCode", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/pricing/quote", payload: { ...QUOTE_BODY, promoCode: "ABC" } });
    expectBoundary(res, "promoCode");
  });

  it("promoCode too long (V-PROMO max 16) -> 400 path promoCode", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/pricing/quote", payload: { ...QUOTE_BODY, promoCode: "A".repeat(17) } });
    expectBoundary(res, "promoCode");
  });

  it("unknown field (strictness) -> 400", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/pricing/quote", payload: { ...QUOTE_BODY, foo: "bar" } });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
