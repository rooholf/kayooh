/**
 * FR-ID-01 (renter phone OTP) and FR-ID-02 (staff/owner/admin) integration
 * tests against the real Postgres cluster (NFR-09).
 */
import { describe, expect, it, afterAll, beforeEach } from "vitest";
import { eq } from "@repo/db";
import { db, renters, users, verifications } from "@repo/db";
import { normalizePhone } from "@repo/contracts";
import {
  buildTestApp,
  seedAdmin,
  seedOutlet,
  seedOwner,
  sessionCookie,
  truncateAll,
  type TestApp,
} from "./helpers.js";

let t: TestApp;

// Fresh app per test: the in-memory rate limiter is per-instance, so buckets
// (cooldowns, lockouts) never leak between tests. The shared pool stays open;
// only the LAST app is closed in afterAll.
beforeEach(async () => {
  await truncateAll();
  t = await buildTestApp();
});

afterAll(async () => {
  await t.close();
});

const PHONE_A = "081234567890";
const PHONE_CANONICAL = "+6281234567890";

async function sendOtp(phone: string, ip?: string) {
  return t.app.inject({
    method: "POST",
    url: "/api/auth/phone-number/send-otp",
    payload: { phoneNumber: phone },
    headers: ip ? { "x-forwarded-for": ip } : {},
  });
}

async function verifyOtp(phone: string, code: string) {
  return t.app.inject({
    method: "POST",
    url: "/api/auth/phone-number/verify",
    payload: { phoneNumber: phone, code },
  });
}

describe("FR-ID-01: renter phone OTP sign-in", () => {
  it("V-PHONE: all three nominal forms normalize to the same +62E.164 value", () => {
    expect(normalizePhone("081234567890")).toBe(PHONE_CANONICAL);
    expect(normalizePhone("+6281234567890")).toBe(PHONE_CANONICAL);
    expect(normalizePhone("6281234567890")).toBe(PHONE_CANONICAL);
  });

  it("stores ONLY the OTP hash (FR-ID-01.3) and sends through the provider", async () => {
    const res = await sendOtp(PHONE_A);
    expect(res.statusCode).toBe(200);

    // At rest: sha256 hex + ":attempts", never the plaintext code.
    const rows = await db
      .select()
      .from(verifications)
      .where(eq(verifications.identifier, PHONE_CANONICAL));
    expect(rows).toHaveLength(1);
    const value = rows[0].value;
    expect(value).toMatch(/^[0-9a-f]{64}:[0-9]+$/);
    const code = t.notifications.lastOtp(PHONE_CANONICAL);
    expect(code).toMatch(/^\d{6}$/);
    // Hash must NOT match the plaintext (i.e. it is a real hash).
    expect(value.startsWith(code)).toBe(false);
  });

  it("treats all phone formats as the same identity (cooldown proves canonicalization)", async () => {
    const first = await sendOtp("081234567890");
    expect(first.statusCode).toBe(200);
    // Same canonical phone through a different nominal form -> cooldown 429.
    const second = await sendOtp("+6281234567890");
    expect(second.statusCode).toBe(429);
    expect(second.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });

  it("rejects the 21st OTP send from one IP within an hour with 429 (FR-ID-01.2)", async () => {
    // 20 sends to distinct phones (per-phone cooldown never trips) exhaust
    // the per-IP hourly budget; the 21st must be refused.
    const ip = `10.1.${Math.floor(Math.random() * 200)}.9`;
    for (let i = 1; i <= 20; i += 1) {
      const res = await sendOtp(`0813999${String(i).padStart(5, "0")}`, ip);
      expect(res.statusCode).toBe(200);
    }
    const twentyFirst = await sendOtp("08139999999", ip);
    expect(twentyFirst.statusCode).toBe(429);
    expect(twentyFirst.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });

  it("invalidates the OTP after 5 wrong attempts; the correct code then fails (FR-ID-01.5)", async () => {
    await sendOtp(PHONE_A);
    const code = t.notifications.lastOtp(PHONE_CANONICAL);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i += 1) {
      const res = await verifyOtp(PHONE_A, wrong);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: { code: "OTP_INVALID" } });
    }
    // Row deleted after the 5th wrong attempt -> correct code no longer works.
    const after = await verifyOtp(PHONE_A, code);
    expect(after.statusCode).toBe(401);
    expect(after.json()).toMatchObject({ error: { code: "OTP_INVALID" } });
  });

  it("creates users + renters rows and a session cookie on first verify (FR-ID-01.6)", async () => {
    await sendOtp(PHONE_A);
    const code = t.notifications.lastOtp(PHONE_CANONICAL);
    const res = await verifyOtp(PHONE_A, code);
    expect(res.statusCode).toBe(200);

    const cookie = sessionCookie(res.headers["set-cookie"]);
    expect(cookie).toContain("better-auth.session_token=");

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.phoneNumber, PHONE_CANONICAL));
    expect(user).toBeDefined();
    expect(user.phoneNumberVerified).toBe(true);
    expect(user.role).toBe("renter");
    // Temp email per A-10 (BA requires one; renters sign up by phone).
    expect(user.email).toBe("phone.6281234567890@renters.jambi.local");

    const [renter] = await db
      .select()
      .from(renters)
      .where(eq(renters.userId, user.id));
    expect(renter).toBeDefined();
    expect(renter.verificationStatus).toBe("not_started");

    // The OTP row is consumed after success.
    const leftover = await db
      .select()
      .from(verifications)
      .where(eq(verifications.identifier, PHONE_CANONICAL));
    expect(leftover).toHaveLength(0);

    // The session works on the SRS API surface.
    const me = await t.app.inject({
      method: "GET",
      url: "/api/v1/renters/me",
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      phone: PHONE_CANONICAL,
      verificationStatus: "not_started",
      depositStatus: "none",
    });
  });

  it("rejects invalid phone formats with VALIDATION_ERROR (V-PHONE)", async () => {
    const res = await sendOtp("12345");
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});

describe("FR-ID-02: staff/owner/admin accounts", () => {
  it("creates a staff account via admin API, audit logged, and it can sign in", async () => {
    const admin = await seedAdmin();
    const adminLogin = await t.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: admin.email, password: admin.password },
    });
    expect(adminLogin.statusCode).toBe(200);
    const adminCookie = sessionCookie(adminLogin.headers["set-cookie"]);

    // Staff needs an outlet; create one directly (outlet CRUD is step 3).
    const { outletId } = await seedOutlet("JMB-001");

    const create = await t.app.inject({
      method: "POST",
      url: "/api/v1/admin/users",
      headers: { cookie: adminCookie },
      payload: {
        email: "staff@kayooh.test",
        password: "staff-password-123456",
        role: "staff",
        outletId,
      },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json()).toMatchObject({ email: "staff@kayooh.test", role: "staff" });

    // Audit trail written (FR-SEC-02).
    const { auditLog } = await import("@repo/db");
    const audits = await db.select().from(auditLog);
    expect(audits.some((a) => a.action === "user.create" && a.entity === "users")).toBe(true);

    // The staff account can sign in (public sign-up cannot create it).
    const login = await t.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: "staff@kayooh.test", password: "staff-password-123456" },
    });
    expect(login.statusCode).toBe(200);
  });

  it("rejects the 6th failed sign-in for one email with 429 for 15 min (FR-ID-02.2)", async () => {
    const admin = await seedAdmin("lockout@kayooh.test");
    for (let i = 0; i < 5; i += 1) {
      const res = await t.app.inject({
        method: "POST",
        url: "/api/auth/sign-in/email",
        payload: { email: admin.email, password: "wrong-password-xxxx" },
      });
      expect(res.statusCode).toBe(401);
    }
    const sixth = await t.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: admin.email, password: admin.password },
    });
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });

  it("disables public sign-up (FR-ID-02.1 / A-10)", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: {
        email: "intruder@kayooh.test",
        password: "intruder-password-123",
        name: "intruder",
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("requires admin role for POST /admin/users (section 1.3)", async () => {
    const owner = await seedOwner();
    const login = await t.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: owner.email, password: owner.password },
    });
    expect(login.statusCode).toBe(200);
    const ownerCookie = sessionCookie(login.headers["set-cookie"]);

    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/admin/users",
      headers: { cookie: ownerCookie },
      payload: {
        email: "nope@kayooh.test",
        password: "nope-password-123456",
        role: "admin",
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("409 on duplicate email (V-rules + DUPLICATE_RESOURCE)", async () => {
    const admin = await seedAdmin();
    const adminLogin = await t.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: admin.email, password: admin.password },
    });
    const adminCookie = sessionCookie(adminLogin.headers["set-cookie"]);

    const { outletId } = await seedOutlet("JMB-002");

    const first = await t.app.inject({
      method: "POST",
      url: "/api/v1/admin/users",
      headers: { cookie: adminCookie },
      payload: {
        email: "dupe@kayooh.test",
        password: "dupe-password-123456",
        role: "staff",
        outletId,
      },
    });
    expect(first.statusCode).toBe(201);

    const second = await t.app.inject({
      method: "POST",
      url: "/api/v1/admin/users",
      headers: { cookie: adminCookie },
      payload: {
        email: "dupe@kayooh.test",
        password: "dupe-password-123456",
        role: "staff",
        outletId,
      },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: { code: "DUPLICATE_RESOURCE" } });
  });
});
