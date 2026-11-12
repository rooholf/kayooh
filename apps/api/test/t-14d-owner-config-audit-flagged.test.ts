/**
 * T-14 (NFR-11) — PR D: boundary values for owner, admin config, flagged
 * scans, and audit-log schemas. Each case sends n-1/n+1 (or a malformed
 * value) and asserts 400 `VALIDATION_ERROR` with `details[].path`.
 *
 * One auth session per test, re-seeded after each truncateAll.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildTestApp, seedAdmin, sessionCookie, truncateAll, type TestApp } from "./helpers.js";
import { seedOwner } from "./helpers.js";

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
  const admin = await seedAdmin();
  const login = await t.app.inject({ method: "POST", url: "/api/auth/sign-in/email", payload: { email: admin.email, password: admin.password } });
  return sessionCookie(login.headers["set-cookie"]);
}

async function ownerCookie(email: string, password: string): Promise<string> {
  const login = await t.app.inject({ method: "POST", url: "/api/auth/sign-in/email", payload: { email, password } });
  return sessionCookie(login.headers["set-cookie"]);
}

describe("T-14 (PR D): owner boundary values", () => {
  it("rentals/bikes query params + category + settings -> 400", async () => {
    const owner = await seedOwner("owner-t14d@kayooh.test");
    const cookie = await ownerCookie(owner.email, owner.password);

    // GET /owner/rentals
    const r1 = await t.app.inject({ method: "GET", url: "/api/v1/owner/rentals?status=foo", headers: { cookie } });
    expectBoundary(r1, "status");
    const r2 = await t.app.inject({ method: "GET", url: "/api/v1/owner/rentals?limit=0", headers: { cookie } });
    expectBoundary(r2, "limit");
    const r2b = await t.app.inject({ method: "GET", url: "/api/v1/owner/rentals?limit=101", headers: { cookie } });
    expectBoundary(r2b, "limit");

    // GET /owner/bikes
    const r3 = await t.app.inject({ method: "GET", url: "/api/v1/owner/bikes?outletId=zzz", headers: { cookie } });
    expectBoundary(r3, "outletId");
    const r4 = await t.app.inject({ method: "GET", url: "/api/v1/owner/bikes?state=foo", headers: { cookie } });
    expectBoundary(r4, "state");
    const r5 = await t.app.inject({ method: "GET", url: `/api/v1/owner/bikes?category=${"x".repeat(17)}`, headers: { cookie } });
    expectBoundary(r5, "category");

    // PATCH /owner/outlets/:outletId/categories/:category
    const r6 = await t.app.inject({ method: "PATCH", url: "/api/v1/owner/outlets/not-a-uuid/categories/commuter", headers: { cookie }, payload: { safetyBuffer: 0 } });
    expectBoundary(r6, "outletId");
    const r7 = await t.app.inject({ method: "PATCH", url: `/api/v1/owner/outlets/${randomUUID()}/categories/commuter`, headers: { cookie }, payload: { safetyBuffer: 2 } });
    expectBoundary(r7, "safetyBuffer");

    // PATCH /owner/settings
    const r8 = await t.app.inject({ method: "PATCH", url: "/api/v1/owner/settings", headers: { cookie }, payload: { promoOptOut: "yes" } });
    expectBoundary(r8, "promoOptOut");
    const r9 = await t.app.inject({ method: "PATCH", url: "/api/v1/owner/settings", headers: { cookie }, payload: { promoOptOut: true, foo: "bar" } });
    expect(r9.statusCode).toBe(400);
    expect(JSON.parse(r9.body).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("T-14 (PR D): admin config boundary values", () => {
  it("config patch key regex / value type / unknown key / strictness", async () => {
    const cookie = await adminCookie();

    // key fails the registry key regex
    const r1 = await t.app.inject({ method: "PATCH", url: "/api/v1/admin/config", headers: { cookie }, payload: { key: "BAD_KEY", value: 1 } });
    expectBoundary(r1, "key");

    // value fails the key's registered schema (condition.min_photos is positiveInt)
    const r2 = await t.app.inject({ method: "PATCH", url: "/api/v1/admin/config", headers: { cookie }, payload: { key: "condition.min_photos", value: 0 } });
    expect(r2.statusCode).toBe(400);
    expect(JSON.parse(r2.body).error.code).toBe("VALIDATION_ERROR");

    // unknown (but regex-valid) key -> 404 NOT_FOUND
    const r3 = await t.app.inject({ method: "PATCH", url: "/api/v1/admin/config", headers: { cookie }, payload: { key: "nope.key", value: 1 } });
    expect(r3.statusCode).toBe(404);
    expect(JSON.parse(r3.body).error.code).toBe("NOT_FOUND");

    // strictness: no extra fields
    const r4 = await t.app.inject({ method: "PATCH", url: "/api/v1/admin/config", headers: { cookie }, payload: { key: "condition.min_photos", value: 5, foo: "bar" } });
    expect(r4.statusCode).toBe(400);
    expect(JSON.parse(r4.body).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("T-14 (PR D): flagged scans boundary values", () => {
  it("list query + resolve id/body boundaries -> 400", async () => {
    const cookie = await adminCookie();

    const r1 = await t.app.inject({ method: "GET", url: "/api/v1/admin/flagged-scans?limit=0", headers: { cookie } });
    expectBoundary(r1, "limit");
    const r2 = await t.app.inject({ method: "GET", url: "/api/v1/admin/flagged-scans?includeResolved=maybe", headers: { cookie } });
    expectBoundary(r2, "includeResolved");

    const validNote = "note with enough length";
    const r3 = await t.app.inject({
      method: "PATCH",
      url: "/api/v1/admin/flagged-scans/not-a-uuid",
      headers: { cookie },
      payload: { resolution: "dismissed", note: validNote },
    });
    expectBoundary(r3, "id");

    const r4 = await t.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/flagged-scans/${randomUUID()}`,
      headers: { cookie },
      payload: { resolution: "dismissed", note: "short" },
    });
    expectBoundary(r4, "note");

    const r5 = await t.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/flagged-scans/${randomUUID()}`,
      headers: { cookie },
      payload: { resolution: "foo", note: validNote },
    });
    expectBoundary(r5, "resolution");
  });
});

describe("T-14 (PR D): audit log boundary values", () => {
  it("query filter boundaries -> 400", async () => {
    const cookie = await adminCookie();

    const r1 = await t.app.inject({ method: "GET", url: `/api/v1/admin/audit-log?entity=${"a".repeat(65)}`, headers: { cookie } });
    expectBoundary(r1, "entity");
    const r2 = await t.app.inject({ method: "GET", url: "/api/v1/admin/audit-log?actorId=zzz", headers: { cookie } });
    expectBoundary(r2, "actorId");
    const r3 = await t.app.inject({ method: "GET", url: "/api/v1/admin/audit-log?from=not-a-ts", headers: { cookie } });
    expectBoundary(r3, "from");
    const r4 = await t.app.inject({ method: "GET", url: "/api/v1/admin/audit-log?limit=101", headers: { cookie } });
    expectBoundary(r4, "limit");
    const r5 = await t.app.inject({ method: "GET", url: "/api/v1/admin/audit-log?foo=bar", headers: { cookie } });
    expect(r5.statusCode).toBe(400);
    expect(JSON.parse(r5.body).error.code).toBe("VALIDATION_ERROR");
  });
});
