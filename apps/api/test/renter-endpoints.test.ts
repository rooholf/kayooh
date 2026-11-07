/**
 * Issue #31 (NEW-D — renter reservation backend gap) integration tests against
 * the real Postgres cluster (NFR-09). Covers the three SRS 7.1 renter endpoints
 * that previously had no route:
 *   - POST /pricing/quote            (FR-PRC-01; T-10 pricing table)
 *   - GET  /reservations             (own list, SRS 3.2 cursor pagination)
 *   - GET  /reservations/{id}/voucher (FR-SEC-01.1, A-18 guest access)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "@repo/db";
import { db, pricingRules } from "@repo/db";
import { normalizePhone } from "@repo/contracts";
import { verifyVoucher } from "../src/lib/voucher.js";
import {
  buildTestApp,
  newIdempotencyKey,
  sessionCookie,
  truncateAll,
  type TestApp,
} from "./helpers.js";
import { nextWindow, seedOffering } from "./staff.helpers.js";

let t: TestApp;

beforeAll(async () => {
  t = await buildTestApp();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await truncateAll();
});

/** Signs in a renter by phone OTP and returns the session cookie. */
async function signInRenter(phone: string): Promise<string> {
  const send = await t.app.inject({
    method: "POST",
    url: "/api/auth/phone-number/send-otp",
    payload: { phoneNumber: phone },
  });
  expect(send.statusCode).toBe(200);
  const code = t.notifications.lastOtp(normalizePhone(phone));
  const verify = await t.app.inject({
    method: "POST",
    url: "/api/auth/phone-number/verify",
    payload: { phoneNumber: phone, code },
  });
  expect(verify.statusCode).toBe(200);
  return sessionCookie(verify.headers["set-cookie"]);
}

/** PUBLIC guest booking (A-17) — returns the 201 body. */
async function guestBooking(outletId: string) {
  const w = nextWindow();
  const res = await t.app.inject({
    method: "POST",
    url: "/api/v1/reservations",
    headers: { "idempotency-key": newIdempotencyKey() },
    payload: { outletId, category: "commuter", startsAt: w.startsAt, endsAt: w.endsAt, contactPhone: "081234567890" },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { reservation: { id: string }; guestToken: string };
}

async function confirm(reservationId: string): Promise<void> {
  await db.execute(sql`
    UPDATE reservations SET status = 'confirmed', confirmed_at = now()
    WHERE id = ${reservationId}::uuid
  `);
}

/* Fixed instants chosen away from boundaries so day type is unambiguous. */
const MONDAY = { startsAt: "2026-11-09T03:00:00Z", endsAt: "2026-11-09T04:30:00Z" }; // Mon 10:00 WIB, 90 min
const SATURDAY = { startsAt: "2026-11-14T03:00:00Z", endsAt: "2026-11-14T04:30:00Z" }; // Sat 10:00 WIB, 90 min

describe("Issue #31: POST /pricing/quote (FR-PRC-01, T-10)", () => {
  it("prices a weekday 90-min window at unit 60 (20000, units 2, dp 10000)", async () => {
    const { outletId } = await seedOffering(1);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/pricing/quote",
      payload: { outletId, category: "commuter", ...MONDAY },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ priceIdr: 20_000, discountIdr: 0, finalIdr: 20_000, dpIdr: 10_000, units: 2 });
  });

  it("uses the weekend rate (15000) on a Saturday -> 30000", async () => {
    const { outletId } = await seedOffering(1);
    await db.insert(pricingRules).values({
      outletId,
      category: "commuter",
      dayType: "weekend",
      rateIdr: 15_000n,
      effectiveFrom: new Date(Date.now() - 3_600_000),
    });
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/pricing/quote",
      payload: { outletId, category: "commuter", ...SATURDAY },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ priceIdr: 30_000, discountIdr: 0, finalIdr: 30_000, dpIdr: 15_000, units: 2 });
  });

  it("ceil()s a 61-minute window to 2 units", async () => {
    const { outletId } = await seedOffering(1);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/pricing/quote",
      payload: { outletId, category: "commuter", startsAt: MONDAY.startsAt, endsAt: "2026-11-09T04:01:00Z" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ priceIdr: 20_000, units: 2 });
  });

  it("rejects a promo code without a session (401 UNAUTHENTICATED) but the outlet rate is untouched", async () => {
    const { outletId } = await seedOffering(1);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/pricing/quote",
      payload: { outletId, category: "commuter", ...MONDAY, promoCode: "SAVE10" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("rejects a promo code with a session as PROMO_INVALID (promotions are P2)", async () => {
    const { outletId } = await seedOffering(1);
    const cookie = await signInRenter("081377702001");
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/pricing/quote",
      headers: { cookie },
      payload: { outletId, category: "commuter", ...MONDAY, promoCode: "SAVE10" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: { code: "PROMO_INVALID" } });
  });

  it("returns 422 CATEGORY_NOT_OFFERED when no rate exists and 422 for a non-positive window", async () => {
    const { outletId } = await seedOffering(1);
    const noRate = await t.app.inject({
      method: "POST",
      url: "/api/v1/pricing/quote",
      payload: { outletId, category: "road", ...MONDAY },
    });
    expect(noRate.statusCode).toBe(422);
    expect(noRate.json()).toMatchObject({ error: { code: "CATEGORY_NOT_OFFERED" } });

    const badWindow = await t.app.inject({
      method: "POST",
      url: "/api/v1/pricing/quote",
      payload: { outletId, category: "commuter", startsAt: MONDAY.endsAt, endsAt: MONDAY.startsAt },
    });
    expect(badWindow.statusCode).toBe(422);
    expect(badWindow.json()).toMatchObject({ error: { code: "DURATION_OUT_OF_RANGE" } });
  });
});

describe("Issue #31: GET /reservations (own list, SRS 3.2)", () => {
  it("requires a renter session", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/v1/reservations" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("lists only the caller's reservations with cursor pagination and count-only fields (NEG-2)", async () => {
    const { outletId } = await seedOffering(5);
    const phone = "081377702002";
    const cookie = await signInRenter(phone);

    for (const offset of [24 * 60, 25 * 60, 26 * 60]) {
      const w = nextWindow(offset);
      const res = await t.app.inject({
        method: "POST",
        url: "/api/v1/reservations",
        headers: { cookie, "idempotency-key": newIdempotencyKey() },
        payload: { outletId, category: "commuter", startsAt: w.startsAt, endsAt: w.endsAt },
      });
      expect(res.statusCode).toBe(201);
    }

    const page1 = await t.app.inject({
      method: "GET",
      url: "/api/v1/reservations",
      headers: { cookie },
      query: { limit: "2" },
    });
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json();
    expect(body1.data).toHaveLength(2);
    expect(body1.nextCursor).toBeTypeOf("string");
    // NEG-2: never expose bike ids or asset tags on renter surfaces.
    for (const item of body1.data) {
      expect(item).not.toHaveProperty("bikeIds");
      expect(item).not.toHaveProperty("assetTags");
    }

    const page2 = await t.app.inject({
      method: "GET",
      url: "/api/v1/reservations",
      headers: { cookie },
      query: { limit: "2", cursor: body1.nextCursor },
    });
    expect(page2.statusCode).toBe(200);
    const body2 = page2.json();
    expect(body2.data).toHaveLength(1);
    expect(body2.nextCursor).toBeNull();

    const ids = [...body1.data, ...body2.data].map((r: { id: string }) => r.id);
    expect(new Set(ids).size).toBe(3);

    // A different renter is outside the scope and sees nothing.
    const otherCookie = await signInRenter("081377702003");
    const other = await t.app.inject({ method: "GET", url: "/api/v1/reservations", headers: { cookie: otherCookie } });
    expect(other.statusCode).toBe(200);
    expect(other.json()).toEqual({ data: [], nextCursor: null });
  });

  it("filters by status", async () => {
    const { outletId } = await seedOffering(3);
    const cookie = await signInRenter("081377702004");
    const w = nextWindow();
    const created = await t.app.inject({
      method: "POST",
      url: "/api/v1/reservations",
      headers: { cookie, "idempotency-key": newIdempotencyKey() },
      payload: { outletId, category: "commuter", startsAt: w.startsAt, endsAt: w.endsAt },
    });
    await confirm(created.json().reservation.id);

    const held = await t.app.inject({
      method: "GET",
      url: "/api/v1/reservations",
      headers: { cookie },
      query: { status: "held" },
    });
    expect(held.json().data).toHaveLength(0);

    const confirmed = await t.app.inject({
      method: "GET",
      url: "/api/v1/reservations",
      headers: { cookie },
      query: { status: "confirmed" },
    });
    expect(confirmed.json().data).toHaveLength(1);
  });
});

describe("Issue #31: GET /reservations/{id}/voucher (FR-SEC-01.1, A-18)", () => {
  it("409 STATE_CONFLICT while the reservation is not confirmed", async () => {
    const { outletId } = await seedOffering(1);
    const cookie = await signInRenter("081377703001");
    const w = nextWindow();
    const created = await t.app.inject({
      method: "POST",
      url: "/api/v1/reservations",
      headers: { cookie, "idempotency-key": newIdempotencyKey() },
      payload: { outletId, category: "commuter", startsAt: w.startsAt, endsAt: w.endsAt },
    });
    const id = created.json().reservation.id;

    const res = await t.app.inject({ method: "GET", url: `/api/v1/reservations/${id}/voucher`, headers: { cookie } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: "STATE_CONFLICT" } });
  });

  it("returns a verifiable voucher to the owning renter once confirmed", async () => {
    const { outletId } = await seedOffering(1);
    const cookie = await signInRenter("081377703002");
    const w = nextWindow();
    const created = await t.app.inject({
      method: "POST",
      url: "/api/v1/reservations",
      headers: { cookie, "idempotency-key": newIdempotencyKey() },
      payload: { outletId, category: "commuter", startsAt: w.startsAt, endsAt: w.endsAt },
    });
    const id = created.json().reservation.id;
    await confirm(id);

    const res = await t.app.inject({ method: "GET", url: `/api/v1/reservations/${id}/voucher`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.expiresAt).toMatch(/Z$/);
    const verdict = verifyVoucher(body.token, new Date());
    expect(verdict).toMatchObject({ ok: true, reservationId: id });
  });

  it("grants a confirmed guest the voucher via Bearer guestToken (A-18)", async () => {
    const { outletId } = await seedOffering(1);
    const { reservation, guestToken } = await guestBooking(outletId);
    await confirm(reservation.id);

    const res = await t.app.inject({
      method: "GET",
      url: `/api/v1/reservations/${reservation.id}/voucher`,
      headers: { authorization: `Bearer ${guestToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(verifyVoucher(res.json().token, new Date())).toMatchObject({ ok: true, reservationId: reservation.id });
  });

  it("401s without a credential and 404s a foreign guest token", async () => {
    const { outletId } = await seedOffering(1);
    const { reservation, guestToken } = await guestBooking(outletId);
    await confirm(reservation.id);
    const url = `/api/v1/reservations/${reservation.id}/voucher`;

    const anon = await t.app.inject({ method: "GET", url });
    expect(anon.statusCode).toBe(401);

    const foreign = await t.app.inject({
      method: "GET",
      url: `/api/v1/reservations/${randomUUID()}/voucher`,
      headers: { authorization: `Bearer ${guestToken}` },
    });
    expect(foreign.statusCode).toBe(404);

    // The owning reservation id resolves with a fresh renter session too.
    const cookie = await signInRenter("081377703003");
    const otherRenter = await t.app.inject({ method: "GET", url, headers: { cookie } });
    expect(otherRenter.statusCode).toBe(404);
  });
});
