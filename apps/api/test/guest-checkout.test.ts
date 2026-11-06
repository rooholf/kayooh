/**
 * Issue #29 (NEW-C — Guest Checkout & Optional Auth, SRS rev 1.2) integration
 * tests against the real Postgres cluster (NFR-09):
 *   - POST /reservations is PUBLIC: an unauthenticated guest books with
 *     `contactPhone` (A-17), receives a reservation-scoped `guestToken`
 *     (A-18) and a WhatsApp delivery through the outbox;
 *   - the authenticated renter path is intact (session wins, no guestToken,
 *     `contactPhone` rejected);
 *   - the A-19 active-reservation cap and guest idempotency keying (SRS 3.2);
 *   - GET /reservations/{id} A-18 access via `Authorization: Bearer <token>`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "@repo/db";
import { db, notifications, renters, reservations } from "@repo/db";
import { normalizePhone } from "@repo/contracts";
import {
  buildTestApp,
  newIdempotencyKey,
  sessionCookie,
  truncateAll,
  type TestApp,
} from "./helpers.js";
import { nextWindow, seedOffering } from "./staff.helpers.js";

let t: TestApp;

// Shared app for the whole file (project guideline): the suite never depends on
// per-instance rate-limiter state, and the shared DB pool must not be closed
// between tests.
beforeAll(async () => {
  t = await buildTestApp();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await truncateAll();
});

/** Canonical guest phone reused by the guest-booking tests (no OTP involved). */
const GUEST_PHONE = "081234567890";
const GUEST_PHONE_CANONICAL = normalizePhone(GUEST_PHONE);

interface GuestBookingOptions {
  phone?: string;
  key?: string;
  window?: { startsAt: string; endsAt: string };
  extra?: Record<string, unknown>;
}

/** POSTs a public guest reservation and returns the raw inject response. */
async function guestBooking(outletId: string, opts: GuestBookingOptions = {}) {
  const w = opts.window ?? nextWindow();
  const payload: Record<string, unknown> = {
    outletId,
    category: "commuter",
    startsAt: w.startsAt,
    endsAt: w.endsAt,
    contactPhone: opts.phone ?? GUEST_PHONE,
    ...opts.extra,
  };
  const res = await t.app.inject({
    method: "POST",
    url: "/api/v1/reservations",
    headers: { "idempotency-key": opts.key ?? newIdempotencyKey() },
    payload,
  });
  return { res, w, payload };
}

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

describe("Issue #29: guest checkout (public POST /reservations)", () => {
  it("books as a guest, returns a guestToken, and delivers it by WhatsApp (A-17/A-18)", async () => {
    const { outletId } = await seedOffering(2);
    const { res } = await guestBooking(outletId);

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.reservation.status).toBe("held");
    // FR-INV-02.4: the online charge is the 50% DP (rate 10_000/h -> 5_000).
    expect(body.reservation.dpIdr).toBe(5_000);
    expect(body.paymentUrl).toMatch(/^https:\/\/pay\.fixtures\.jambi\.test\//);
    // A-18: a guest booking carries a reservation-scoped token.
    expect(body.guestToken).toBeTypeOf("string");

    // A-17: the guest is a `renters` row keyed by phone with user_id = NULL.
    const [renter] = await db
      .select()
      .from(renters)
      .where(eq(renters.phone, GUEST_PHONE_CANONICAL));
    expect(renter).toBeDefined();
    expect(renter.userId).toBeNull();

    // A-18 delivery: the token rides the outbox as a WhatsApp notification to
    // the guest phone, with no `users` row (userId NULL).
    const [notif] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.template, "guest_reservation_access"));
    expect(notif).toBeDefined();
    expect(notif.userId).toBeNull();
    expect(notif.channel).toBe("whatsapp");
    const vars = notif.vars as Record<string, unknown>;
    expect(String(vars.guestToken ?? "")).toBe(body.guestToken);
    expect(String(vars.reservationId ?? "")).toBe(body.reservation.id);
  });

  it("requires contactPhone for an unauthenticated guest (400 VALIDATION_ERROR)", async () => {
    const { outletId } = await seedOffering(1);
    const w = nextWindow();
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/reservations",
      headers: { "idempotency-key": newIdempotencyKey() },
      payload: { outletId, category: "commuter", startsAt: w.startsAt, endsAt: w.endsAt },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("refuses a promo code without a session (401 UNAUTHENTICATED)", async () => {
    const { outletId } = await seedOffering(1);
    const { res } = await guestBooking(outletId, { extra: { promoCode: "SAVE10" } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("keeps the authenticated renter path: session wins and contactPhone is rejected", async () => {
    const { outletId } = await seedOffering(2);
    const cookie = await signInRenter("081377700001");
    const w = nextWindow();

    // `contactPhone` is only for guests — rejected on an authenticated request.
    const rejected = await t.app.inject({
      method: "POST",
      url: "/api/v1/reservations",
      headers: { cookie, "idempotency-key": newIdempotencyKey() },
      payload: {
        outletId,
        category: "commuter",
        startsAt: w.startsAt,
        endsAt: w.endsAt,
        contactPhone: "081377700001",
      },
    });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    // The clean authenticated booking succeeds and returns NO guestToken.
    const ok = await t.app.inject({
      method: "POST",
      url: "/api/v1/reservations",
      headers: { cookie, "idempotency-key": newIdempotencyKey() },
      payload: { outletId, category: "commuter", startsAt: w.startsAt, endsAt: w.endsAt },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().guestToken).toBeUndefined();
  });

  it("refuses a 4th active reservation for one phone (409 DUPLICATE_RESOURCE, A-19)", async () => {
    const { outletId } = await seedOffering(5);
    const w = nextWindow();
    for (let i = 0; i < 3; i += 1) {
      const { res } = await guestBooking(outletId, { window: w });
      expect(res.statusCode).toBe(201);
    }
    const { res } = await guestBooking(outletId, { window: w });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: "DUPLICATE_RESOURCE" } });
  });

  it("replays a guest booking idempotently, scoped by contactPhone (SRS 3.2)", async () => {
    const { outletId } = await seedOffering(2);
    const w = nextWindow();
    const key = newIdempotencyKey();
    const payload = {
      outletId,
      category: "commuter",
      startsAt: w.startsAt,
      endsAt: w.endsAt,
      contactPhone: GUEST_PHONE,
    };
    const first = await t.app.inject({
      method: "POST",
      url: "/api/v1/reservations",
      headers: { "idempotency-key": key },
      payload,
    });
    expect(first.statusCode).toBe(201);

    const second = await t.app.inject({
      method: "POST",
      url: "/api/v1/reservations",
      headers: { "idempotency-key": key },
      payload,
    });
    expect(second.statusCode).toBe(201);
    expect(second.headers["idempotent-replay"]).toBe("true");
    expect(second.json().reservation.id).toBe(first.json().reservation.id);

    // The replay created exactly one reservation.
    expect(await db.select().from(reservations)).toHaveLength(1);
  });
});

describe("Issue #29: GET /reservations/{id} guest access (A-18)", () => {
  it("reads the reservation via Bearer guestToken; missing/foreign tokens leak nothing", async () => {
    const { outletId } = await seedOffering(2);
    const { res } = await guestBooking(outletId);
    const { reservation, guestToken } = res.json();
    const url = `/api/v1/reservations/${reservation.id}`;

    // No credential -> 401.
    const anon = await t.app.inject({ method: "GET", url });
    expect(anon.statusCode).toBe(401);
    expect(anon.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });

    // Correct token -> 200, count-only fields (NEG-2: never bike ids/tags).
    const ok = await t.app.inject({
      method: "GET",
      url,
      headers: { authorization: `Bearer ${guestToken}` },
    });
    expect(ok.statusCode).toBe(200);
    const body = ok.json();
    expect(body).toMatchObject({ id: reservation.id, category: "commuter", quantity: 1, status: "held" });
    expect(body).not.toHaveProperty("bikeIds");
    expect(body).not.toHaveProperty("assetTags");

    // A token minted for a DIFFERENT reservation -> 404 (never leak existence).
    const foreign = await t.app.inject({
      method: "GET",
      url: `/api/v1/reservations/${randomUUID()}`,
      headers: { authorization: `Bearer ${guestToken}` },
    });
    expect(foreign.statusCode).toBe(404);
  });

  it("links a guest phone to its later session (A-17) and hides the reservation from other renters", async () => {
    const { outletId } = await seedOffering(2);
    const phone = "081377700002";
    const canonical = normalizePhone(phone);

    // Guest books first (creates the phone-keyed renters row with user_id NULL).
    const { res } = await guestBooking(outletId, { phone });
    const reservationId = res.json().reservation.id;
    const url = `/api/v1/reservations/${reservationId}`;

    // The SAME phone later verifies -> LINKS the existing row (no duplicate).
    const cookie = await signInRenter(phone);
    const owner = await t.app.inject({ method: "GET", url, headers: { cookie } });
    expect(owner.statusCode).toBe(200);

    const rows = await db.select().from(renters).where(eq(renters.phone, canonical));
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).not.toBeNull();

    // A different renter is outside the scope -> 404.
    const otherCookie = await signInRenter("081377700003");
    const hidden = await t.app.inject({ method: "GET", url, headers: { cookie: otherCookie } });
    expect(hidden.statusCode).toBe(404);
  });
});
