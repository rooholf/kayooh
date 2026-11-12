/**
 * T-14 (NFR-11) — PR D: boundary values for owner, admin config,
 * flagged-scans, and audit-log schemas. Each case sends n-1/n+1 (or a
 * malformed value) and asserts 400 `VALIDATION_ERROR` with
 * `details[].path` where the route parses the schema itself.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildTestApp, seedAdmin, seedOwner, sessionCookie, truncateAll, type TestApp } from "./helpers.js";

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

async function ownerCookie(): Promise<string> {
  const owner = await seedOwner("owner-t14d@kayooh.test");
  const login = await t.app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: { email: owner.email, password: owner.password },
  });
  expect(login.statusCode).toBe(200);
  return sessionCookie(login.headers["set-cookie"]);
}

async function adminCookie(): Promise<string> {
  const admin = await seedAdmin();
  const login = await t.app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: { email: admin.email, password: admin.password },
  });
  expect(login.statusCode).toBe(200);
  return sessionCookie(login.headers["set-cookie"]);
}

describe("T-14 (PR D): owner read/mutation boundary values", () => {
  it("GET /owner/rentals query boundaries -> 400", async () => {
    const cookie = await ownerCookie();
    const r1 = await t.app.inject({ method: "GET", url: "/api/v1/owner/rentals?status=foo", headers: { cookie } });
    expectBoundary(r1, "status");
    const r2 = await t.app.inject({ method: "GET", url: "/api/v1/owner/rentals?limit=0", headers: { cookie } });
    expectBoundary(r2, "limit");
    const r3 = await t.app.inject({ method: "GET", url: "/api/v1/owner/rentals?limit=101", headers: { cookie } });
    expectBoundary(r3, "limit");
    const r4 = await t.app.inject({ method: "GET", url: `/api/v1/owner/rentals?cursor=${"a".repeat(257)}`, headers: { cookie } });
    expectBoundary(r4, "cursor");
    const r5 = await t.app.inject({ method: "GET", url: "/api/v1/owner/rentals?from=not-a-ts", headers: { cookie } });
    expectBoundary(r5, "from");
    const r6 = await t.app.inject({ method: "GET", url: "/api/v1/owner/rentals?foo=bar", headers: { cookie } });
    expect(r6.statusCode).toBe(400);
    expect(JSON.parse(r6.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /owner/bikes query boundaries -> 400", async () => {
    const cookie = await ownerCookie();
    const r1 = await t.app.inject({ method: "GET", url: "/api/v1/owner/bikes?outletId=zzz", headers: { cookie } });
    expectBoundary(r1, "outletId");
    const r2 = await t.app.inject({ method: "GET", url: "/api/v1/owner/bikes?state=bogus", headers: { cookie } });
    expectBoundary(r2, "state");
    // category: vCategoryCode is 2-16 chars
    const r3 = await t.app.inject({ method: "GET", url: "/api/v1/owner/bikes?category=x", headers: { cookie } });
    expectBoundary(r3, "category");
    const r4 = await t.app.inject({ method: "GET", url: `/api/v1/owner/bikes?category=${"x".repeat(17)}`, headers: { cookie } });
    expectBoundary(r4, "category");
  });

  it("PATCH /owner/outlets/:outletId/categories/:category -> 400", async () => {
    const cookie = await ownerCookie();
    const r1 = await t.app.inject({
      method: "PATCH",
      url: "/api/v1/owner/outlets/not-a-uuid/categories/commuter",
      headers: { cookie },
      payload: { safetyBuffer: 0 },
    });
    expectBoundary(r1, "outletId");
    const r2 = await t.app.inject({
      method: "PATCH",
      url: `/api/v1/owner/outlets/${randomUUID()}/categories/${"x".repeat(17)}`,
      headers: { cookie },
      payload: { safetyBuffer: 0 },
    });
    expectBoundary(r2, "category");
    const r3 = await t.app.inject({
      method: "PATCH",
      url: `/api/v1/owner/outlets/${randomUUID()}/categories/commuter`,
      headers: { cookie },
      payload: { safetyBuffer: 2 },
    });
    expectBoundary(r3, "safetyBuffer");
  });

  it("PATCH /owner/settings -> 400", async () => {
    const cookie = await ownerCookie();
    const r1 = await t.app.inject({
      method: "PATCH",
      url: "/api/v1/owner/settings",
      headers: { cookie },
      payload: { promoOptOut: "yes" },
    });
    expectBoundary(r1, "promoOptOut");
    const r2 = await t.app.inject({
      method: "PATCH",
      url: "/api/v1/owner/settings",
      headers: { cookie },
      payload: { promoOptOut: true, foo: 1 },
    });
    expect(r2.statusCode).toBe(400);
    expect(JSON.parse(r2.body).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("T-14 (PR D): admin config boundary values", () => {
  it("PATCH /admin/config key regex / value type / unknown key / strictness", async () => {
    const cookie = await adminCookie();
    // key fails the regex ^[a-z][a-z0-9_.]{1,99}$ (uppercase)
    const r1 = await t.app.inject({
      method: "PATCH",
      url: "/api/v1/admin/config",
      headers: { cookie },
      payload: { key: "NOT_A_VALID_KEY", value: 1 },
    });
    expectBoundary(r1, "key");
    // value type-checks against the key's registry schema (condition.min_photos is positiveInt)
    const r2 = await t.app.inject({
      method: "PATCH",
      url: "/api/v1/admin/config",
      headers: { cookie },
      payload: { key: "condition.min_photos", value: 0 },
    });
    expect(r2.statusCode).toBe(400);
    expect(JSON.parse(r2.body).error.code).toBe("VALIDATION_ERROR");
    // unknown key -> 404 NOT_FOUND
    const r3 = await t.app.inject({
      method: "PATCH",
      url: "/api/v1/admin/config",
      headers: { cookie },
      payload: { key: "nope.nope", value: 1 },
    });
    expect(r3.statusCode).toBe(404);
    expect(JSON.parse(r3.body).error.code).toBe("NOT_FOUND");
    // strictness
    const r4 = await t.app.inject({
      method: "PATCH",
      url: "/api/v1/admin/config",
      headers: { cookie },
      payload: { key: "condition.min_photos", value: 5, foo: "bar" },
    });
    expect(r4.statusCode).toBe(400);
    expect(JSON.parse(r4.body).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("T-14 (PR D): flagged scans boundary values", () => {
  it("GET /admin/flagged-scans query boundaries -> 400", async () => {
    const cookie = await adminCookie();
    const r1 = await t.app.inject({ method: "GET", url: "/api/v1/admin/flagged-scans?limit=0", headers: { cookie } });
    expectBoundary(r1, "limit");
    const r2 = await t.app.inject({ method: "GET", url: "/api/v1/admin/flagged-scans?includeResolved=maybe", headers: { cookie } });
    expectBoundary(r2, "includeResolved");
  });

  it("PATCH /admin/flagged-scans/:id boundaries -> 400", async () => {
    const cookie = await adminCookie();
    const r1 = await t.app.inject({
      method: "PATCH",
      url: "/api/v1/admin/flagged-scans/not-a-uuid",
      headers: { cookie },
      payload: { resolution: "dismissed", note: "a valid note 10+ chars" },
    });
    expectBoundary(r1, "id");
    const id = randomUUID();
    // note: vTextL min 10
    const r2 = await t.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/flagged-scans/${id}`,
      headers: { cookie },
      payload: { resolution: "dismissed", note: "short" },
    });
    expectBoundary(r2, "note");
    const r3 = await t.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/flagged-scans/${id}`,
      headers: { cookie },
      payload: { resolution: "foo", note: "a valid note 10+ chars" },
    });
    expectBoundary(r3, "resolution");
    const r4 = await t.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/flagged-scans/${id}`,
      headers: { cookie },
      payload: { resolution: "dismissed", note: "a valid note 10+ chars", foo: 1 },
    });
    expect(r4.statusCode).toBe(400);
    expect(JSON.parse(r4.body).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("T-14 (PR D): audit log boundary values", () => {
  it("GET /admin/audit-log filter boundaries -> 400", async () => {
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
