/**
 * T-14 (NFR-11) — PR B: boundary values for identity, renter reservation
 * reads, and reallocation schemas. Each case sends n-1/n+1 (or a malformed
 * value) and asserts 400 `VALIDATION_ERROR` with `details[].path`.
 *
 * Tests are grouped to minimise auth round-trips (rate limiter, SRS 3.2).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "@repo/db";
import { db } from "@repo/db";
import { normalizePhone } from "@repo/contracts";
import { buildTestApp, newIdempotencyKey, sessionCookie, truncateAll, type TestApp } from "./helpers.js";
import { seedOffering, nextWindow } from "./staff.helpers.js";

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

async function adminCookie(): Promise<string> {
  const admin = await (await import("./helpers.js")).seedAdmin();
  const login = await t.app.inject({ method: "POST", url: "/api/auth/sign-in/email", payload: { email: admin.email, password: admin.password } });
  return sessionCookie(login.headers["set-cookie"]);
}

async function signInRenter(phone: string): Promise<string> {
  const send = await t.app.inject({ method: "POST", url: "/api/auth/phone-number/send-otp", payload: { phoneNumber: phone } });
  expect(send.statusCode).toBe(200);
  const code = t.notifications.lastOtp(normalizePhone(phone));
  const verify = await t.app.inject({ method: "POST", url: "/api/auth/phone-number/verify", payload: { phoneNumber: phone, code } });
  expect(verify.statusCode).toBe(200);
  return sessionCookie(verify.headers["set-cookie"]);
}

describe("T-14 (PR B): identity admin/users boundary values", () => {
  it("email boundaries (min 3 / max 254) -> 400 path email", async () => {
    const cookie = await adminCookie();
    const r1 = await t.app.inject({ method: "POST", url: "/api/v1/admin/users", headers: { cookie }, payload: { email: "a@", password: "a".repeat(12), role: "staff", outletId: "11111111-1111-4111-8111-111111111111" } });
    expectBoundary(r1, "email");
    const r2 = await t.app.inject({ method: "POST", url: "/api/v1/admin/users", headers: { cookie }, payload: { email: `${"a".repeat(250)}@x.com`, password: "a".repeat(12), role: "staff", outletId: "11111111-1111-4111-8111-111111111111" } });
    expectBoundary(r2, "email");
  });

  it("password boundaries (min 12 / max 128) -> 400 path password", async () => {
    const cookie = await adminCookie();
    const r1 = await t.app.inject({ method: "POST", url: "/api/v1/admin/users", headers: { cookie }, payload: { email: "x@y.com", password: "short", role: "staff", outletId: "11111111-1111-4111-8111-111111111111" } });
    expectBoundary(r1, "password");
    const r2 = await t.app.inject({ method: "POST", url: "/api/v1/admin/users", headers: { cookie }, payload: { email: "x@y.com", password: "a".repeat(129), role: "staff", outletId: "11111111-1111-4111-8111-111111111111" } });
    expectBoundary(r2, "password");
  });

  it("role enum / outletId / ownerId / strictness -> 400", async () => {
    const cookie = await adminCookie();
    const r1 = await t.app.inject({ method: "POST", url: "/api/v1/admin/users", headers: { cookie }, payload: { email: "x@y.com", password: "a".repeat(12), role: "renter", outletId: "11111111-1111-4111-8111-111111111111" } });
    expectBoundary(r1, "role");
    const r2 = await t.app.inject({ method: "POST", url: "/api/v1/admin/users", headers: { cookie }, payload: { email: "x@y.com", password: "a".repeat(12), role: "staff", outletId: "zzz" } });
    expectBoundary(r2, "outletId");
    const r3 = await t.app.inject({ method: "POST", url: "/api/v1/admin/users", headers: { cookie }, payload: { email: "x@y.com", password: "a".repeat(12), role: "owner", ownerId: "zzz" } });
    expectBoundary(r3, "ownerId");
    const r4 = await t.app.inject({ method: "POST", url: "/api/v1/admin/users", headers: { cookie }, payload: { email: "x@y.com", password: "a".repeat(12), role: "admin", foo: "bar" } });
    expect(r4.statusCode).toBe(400);
    expect(JSON.parse(r4.body).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("T-14 (PR B): reservations read params boundary values", () => {
  it("malformed :id on detail/voucher -> 400 path id", async () => {
    const r1 = await t.app.inject({ method: "GET", url: "/api/v1/reservations/not-a-uuid" });
    expectBoundary(r1, "id");
    const r2 = await t.app.inject({ method: "GET", url: "/api/v1/reservations/not-a-uuid/voucher" });
    expectBoundary(r2, "id");
  });

  it("list query boundaries (limit/status/cursor/strictness) -> 400", async () => {
    const cookie = await signInRenter("081234567810");
    const r1 = await t.app.inject({ method: "GET", url: "/api/v1/reservations?limit=0", headers: { cookie } });
    expectBoundary(r1, "limit");
    const r2 = await t.app.inject({ method: "GET", url: "/api/v1/reservations?limit=101", headers: { cookie } });
    expectBoundary(r2, "limit");
    const r3 = await t.app.inject({ method: "GET", url: "/api/v1/reservations?status=foo", headers: { cookie } });
    expectBoundary(r3, "status");
    const r4 = await t.app.inject({ method: "GET", url: `/api/v1/reservations?cursor=${"a".repeat(257)}`, headers: { cookie } });
    expectBoundary(r4, "cursor");
    const r5 = await t.app.inject({ method: "GET", url: "/api/v1/reservations?foo=bar", headers: { cookie } });
    expect(r5.statusCode).toBe(400);
    expect(JSON.parse(r5.body).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("T-14 (PR B): reallocation boundary values", () => {
  it("malformed :id on alternatives/reallocate/decline -> 400 path id", async () => {
    // alternatives + decline need auth; reallocate needs auth. Use one session.
    const cookie = await signInRenter("081234567811");
    const r1 = await t.app.inject({ method: "GET", url: "/api/v1/reservations/not-a-uuid/alternatives", headers: { cookie } });
    expectBoundary(r1, "id");
    const r2 = await t.app.inject({ method: "POST", url: "/api/v1/reservations/not-a-uuid/reallocate", headers: { cookie, "idempotency-key": newIdempotencyKey() }, payload: { outletId: "11111111-1111-4111-8111-111111111111" } });
    expectBoundary(r2, "id");
    const r3 = await t.app.inject({ method: "POST", url: "/api/v1/reservations/not-a-uuid/decline-reallocation", headers: { cookie } });
    expectBoundary(r3, "id");
  });

  it("reallocate malformed outletId -> 400 path outletId", async () => {
    const phone = "081234567812";
    const cookie = await signInRenter(phone);
    const offering = await seedOffering(1);
    const w = nextWindow();
    const booked = await t.app.inject({
      method: "POST",
      url: "/api/v1/reservations",
      headers: { cookie, "idempotency-key": newIdempotencyKey() },
      payload: { outletId: offering.outletId, category: "commuter", startsAt: w.startsAt, endsAt: w.endsAt },
    });
    expect(booked.statusCode).toBe(201);
    const reservationId = (booked.json() as { reservation: { id: string } }).reservation.id;
    await db.execute(sql`UPDATE reservations SET status='confirmed', confirmed_at=now() WHERE id=${reservationId}::uuid`);
    const res = await t.app.inject({
      method: "POST",
      url: `/api/v1/reservations/${reservationId}/reallocate`,
      headers: { cookie, "idempotency-key": newIdempotencyKey() },
      payload: { outletId: "zzz" },
    });
    expectBoundary(res, "outletId");
  });
});
