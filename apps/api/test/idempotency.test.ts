/**
 * Idempotency middleware tests (SRS 3.2) against the real Postgres cluster.
 * The POST /reservations route exists (scaffold) and its business transaction
 * is a later skill, so the happy path here is the 500 INTERNAL it currently
 * fails closed with — the idempotency mechanics are what is under test.
 */
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "@repo/db";
import { idempotencyKeys, users } from "@repo/db";
import { db } from "@repo/db";
import { hashRequest } from "../src/lib/idempotency.js";
import {
  buildTestApp,
  newIdempotencyKey,
  seedAdmin,
  sessionCookie,
  truncateAll,
  type TestApp,
} from "./helpers.js";

let t: TestApp;
let adminCookie: string;

async function seedAndLogin(): Promise<string> {
  const admin = await seedAdmin();
  const login = await t.app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: { email: admin.email, password: admin.password },
  });
  expect(login.statusCode).toBe(200);
  return sessionCookie(login.headers["set-cookie"]);
}

beforeAll(async () => {
  t = await buildTestApp();
  await truncateAll();
  adminCookie = await seedAndLogin();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await truncateAll();
  adminCookie = await seedAndLogin();
});

const BODY = { outletId: "00000000-0000-0000-0000-000000000001", startAt: "2026-11-05T09:00:00Z", durationMinutes: 60 };

function postReservation(key?: string, body: unknown = BODY) {
  return t.app.inject({
    method: "POST",
    url: "/api/v1/reservations",
    headers: {
      cookie: adminCookie,
      ...(key ? { "idempotency-key": key } : {}),
    },
    payload: body,
  });
}

describe("idempotency middleware (SRS 3.2)", () => {
  it("requires the Idempotency-Key header on POST /reservations", async () => {
    const res = await postReservation();
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(res.json().error.details).toEqual([
      { path: "headers.Idempotency-Key", issue: "required" },
    ]);
  });

  it("rejects a non-UUID key", async () => {
    const res = await postReservation("not-a-uuid");
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("replays a stored 2xx response for the same key + body", async () => {
    const key = newIdempotencyKey();
    // Seed a COMPLETED row (2xx stored per the table's check constraint) —
    // the reservations business transaction is a later skill, so the live
    // route cannot produce a 2xx yet.
    const [adminUser] = await db.select().from(users).limit(1);
    const storedResponse = { id: "11111111-1111-1111-1111-111111111111", status: "held" };
    await db.insert(idempotencyKeys).values({
      key,
      userId: adminUser.id,
      requestHash: hashRequest({ method: "POST", url: "/api/v1/reservations", body: BODY }),
      response: storedResponse,
      statusCode: 201,
    });
    const res = await postReservation(key);
    expect(res.statusCode).toBe(201);
    expect(res.headers["idempotent-replay"]).toBe("true");
    expect(res.json()).toEqual(storedResponse);
  });

  it("releases the key after a failed response so the client can retry", async () => {
    const key = newIdempotencyKey();
    const first = await postReservation(key); // 400 VALIDATION_ERROR (BODY is not the FR-INV-02 schema)
    expect(first.statusCode).toBe(400);
    // The pending row was released: an immediate retry is NOT in-progress.
    const [adminUser] = await db.select().from(users).limit(1);
    const rows = await db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.userId, adminUser.id)));
    expect(rows).toHaveLength(0);
  });

  it("422 IDEMPOTENCY_KEY_REUSED for the same key with a different body", async () => {
    const key = newIdempotencyKey();
    const [adminUser] = await db.select().from(users).limit(1);
    await db.insert(idempotencyKeys).values({
      key,
      userId: adminUser.id,
      requestHash: hashRequest({ method: "POST", url: "/api/v1/reservations", body: BODY }),
      response: { ok: true },
      statusCode: 201,
    });
    const res = await postReservation(key, { ...BODY, durationMinutes: 120 });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: { code: "IDEMPOTENCY_KEY_REUSED" } });
  });

  it("409 IDEMPOTENCY_IN_PROGRESS while the first request is still pending", async () => {
    const key = newIdempotencyKey();
    // Simulate a request that reserved the key but has not completed: the
    // row must carry the hash of THIS request (hash mismatch is checked
    // first and would be KEY_REUSED, not IN_PROGRESS).
    const [adminUser] = await db.select().from(users).limit(1);
    await db.insert(idempotencyKeys).values({
      key,
      userId: adminUser.id,
      requestHash: hashRequest({ method: "POST", url: "/api/v1/reservations", body: BODY }),
    });
    const res = await postReservation(key);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: "IDEMPOTENCY_IN_PROGRESS" } });
  });

  it("scopes keys per user: another user's same key is a fresh request", async () => {
    const key = newIdempotencyKey();
    const [adminUser] = await db.select().from(users).limit(1);
    await db.insert(idempotencyKeys).values({
      key,
      userId: adminUser.id,
      requestHash: hashRequest({ method: "POST", url: "/api/v1/reservations", body: BODY }),
      response: { ok: true },
      statusCode: 201,
    });
    // A second admin with the SAME key must not receive the first one's replay.
    const second = await seedAdmin("second-admin@kayooh.test");
    const secondLogin = await t.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: second.email, password: second.password },
    });
    const secondCookie = sessionCookie(secondLogin.headers["set-cookie"]);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/reservations",
      headers: { cookie: secondCookie, "idempotency-key": key },
      payload: BODY,
    });
    expect(res.statusCode).toBe(400); // fresh request, not a replay
    expect(res.headers["idempotent-replay"]).toBeUndefined();
    // The first user's stored row is untouched.
    const rows = await db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.userId, adminUser.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0].statusCode).toBe(201);
  });
});
