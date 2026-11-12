/**
 * Better Auth instance (SRS 2: pinned; G-02 verified against 1.7.15).
 *
 * - Renter sign-in: phone-number OTP (FR-ID-01). OTP storage is hash-only
 *   through modules/identity/otp.ts; sends go through NotificationProvider.
 * - Staff/owner/admin: email + password (FR-ID-02). Public sign-up is
 *   disabled; accounts exist only via POST /admin/users (A-10).
 * - Per-role absolute session TTLs (FR-ID-02.3) are enforced in the request
 *   guard (guards.ts); BA's own cookie TTL carries the renter 30 d sliding.
 */
import { and, eq, isNull } from "@repo/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { phoneNumber } from "better-auth/plugins";
import {
  accounts,
  db,
  renters,
  sessions,
  users,
  verifications,
} from "@repo/db";
import { isValidNominalPhone, normalizePhone } from "@repo/contracts";
import type { NotificationProvider, RateLimiter } from "../../lib/types.js";
import { OTP_LIMITS, issueOtp, otpSendError, verifyOtp } from "./otp.js";

export interface AuthDeps {
  authSecret: string;
  notificationProvider: NotificationProvider;
  limiter: RateLimiter;
}

/**
 * Structural surface of the configured Better Auth instance used by the app.
 * A full `ReturnType<typeof betterAuth>` annotation is not portable (it leaks
 * better-auth's private zov/zod copy into the public type), so we declare
 * exactly what app.ts consumes: the request handler and getSession.
 */
export interface AuthBundle {
  auth: {
    handler: (request: Request) => Promise<Response>;
    api: {
      getSession(args: { headers: Headers }): Promise<{
        session: {
          id: string;
          token: string;
          createdAt: Date;
          expiresAt: Date;
          userId: string;
        };
        user: {
          id: string;
          role?: string;
          ownerId?: string | null;
          outletId?: string | null;
        };
      } | null>;
    };
  };
}

export function createAuthBundle(deps: AuthDeps): AuthBundle {
  /* --- OTP send limits (FR-ID-01.2) --------------------------------- */
  async function enforceOtpSendLimits(phone: string, ip?: string | null): Promise<void> {
    const cooldown = await deps.limiter.hit(`otp:phone:cooldown:${phone}`, {
      limit: 1,
      windowSec: OTP_LIMITS.perPhoneWindowSec,
    });
    if (!cooldown.allowed) throw otpSendError("phone_cooldown");

    const hourly = await deps.limiter.hit(`otp:phone:hour:${phone}`, {
      limit: OTP_LIMITS.perPhoneHourlyLimit,
      windowSec: 3600,
    });
    if (!hourly.allowed) throw otpSendError("phone_hourly");

    if (ip) {
      const ipLimit = await deps.limiter.hit(`otp:ip:hour:${ip}`, {
        limit: OTP_LIMITS.perIpHourlyLimit,
        windowSec: 3600,
      });
      if (!ipLimit.allowed) throw otpSendError("ip_hourly");
    }
  }

  /* --- Email lockout (FR-ID-02.2) ----------------------------------- */
  const LOCK_WINDOW_SEC = 15 * 60; // 15 minutes
  const LOCK_MAX_FAILURES = 5;

  /**
   * 5 failures within 15 min lock the email for 15 min. The check PEEKS
   * (does not count as an attempt); only real failures increment the bucket,
   * so the 5th failure still answers 401 and the 6th attempt gets 429.
   */
  async function isEmailLocked(email: string): Promise<boolean> {
    return (await deps.limiter.peek(`signin:fail:${email}`)) >= LOCK_MAX_FAILURES;
  }

  async function recordSignInFailure(email: string): Promise<void> {
    await deps.limiter.hit(`signin:fail:${email}`, {
      limit: LOCK_MAX_FAILURES,
      windowSec: LOCK_WINDOW_SEC,
    });
  }

  const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
    // The web app signs in through the same-origin pipe, so Better Auth sees
    // the WEB origin on form endpoints (sign-in/email runs form-CSRF). The
    // API's own origin (baseURL) is trusted by default; add the web one.
    trustedOrigins: [process.env.BETTER_AUTH_WEB_ORIGIN ?? "http://localhost:3000"],
    secret: deps.authSecret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // FR-ID-02.1: accounts created only by admin
      minPasswordLength: 12, // V-PASSWORD
      maxPasswordLength: 128,
    },
    session: {
      // Renter default: 30 days, sliding (FR-ID-01.7). Staff/owner/admin
      // absolute TTLs are enforced in guards.ts (FR-ID-02.3).
      expiresIn: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },
    advanced: {
      database: { generateId: "uuid" },
      // SRS 3.2: HttpOnly; Secure; SameSite=Lax (Secure only under TLS).
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
    user: {
      additionalFields: {
        // input:false — a caller can NEVER set its own role/owner/outlet
        // (privilege-escalation guard; admin provisioning writes these directly).
        role: { type: "string", required: true, input: false, returned: true, defaultValue: "renter" },
        ownerId: { type: "string", required: false, input: false, returned: true },
        outletId: { type: "string", required: false, input: false, returned: true },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // FR-ID-02.2: after 5 failures in 15 min for one email, lock 15 min.
        if (ctx.path === "/sign-in/email" && ctx.request?.method === "POST") {
          const body = ctx.body as { email?: string } | undefined;
          if (body?.email) {
            const email = body.email.trim().toLowerCase();
            if (await isEmailLocked(email)) {
              throw new APIError("TOO_MANY_REQUESTS", { message: "RATE_LIMITED", code: "RATE_LIMITED" });
            }
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-in/email" && ctx.request?.method === "POST") {
          // On failure the endpoint throws; `returned` is then the APIError
          // itself, whose status lives in `statusCode` (a Response carries it
          // in `status`).
          const returned = (ctx.context as { returned?: { status?: number; statusCode?: number } })
            .returned;
          const status = returned?.statusCode ?? returned?.status;
          if (typeof status === "number" && (status === 400 || status === 401)) {
            const body = ctx.body as { email?: string } | undefined;
            if (body?.email) {
              await recordSignInFailure(body.email.trim().toLowerCase());
            }
          }
        }
      }),
    },
    plugins: [
      phoneNumber({
        otpLength: 6,
        expiresIn: 300, // FR-ID-01.3: TTL 300 s
        allowedAttempts: 5, // FR-ID-01.5
        phoneNumberValidator: (p: string) => isValidNominalPhone(normalizePhone(p)),
        sendOTP: async ({ phoneNumber: rawPhone }, ctx) => {
          const phone = normalizePhone(rawPhone);
          const ip = ctx?.request?.headers?.get?.("x-forwarded-for") ?? null;
          await enforceOtpSendLimits(phone, ip);
          const code = await issueOtp(rawPhone, phone); // hash-only at rest
          await deps.notificationProvider.send({
            channel: "whatsapp",
            template: "otp",
            to: phone,
            vars: { code, ttlMinutes: 5 },
          });
        },
        // Custom verifier: the plugin's built-in compares plaintext; ours
        // checks the sha256 hash and enforces the 5-attempt invalidation.
        verifyOTP: async ({ phoneNumber: rawPhone, code }) => {
          const result = await verifyOtp(normalizePhone(rawPhone), code);
          return result.ok;
        },
        // FR-ID-01.6 / A-17: on first successful verify, link an existing guest
        // `renters` row with the same phone (user_id = NULL) by setting its
        // user_id instead of inserting a duplicate; otherwise create the row.
        // The phone is the booking identity across guest and authenticated use.
        callbackOnVerification: async ({ user }) => {
          const canonical = user.phoneNumber ? normalizePhone(user.phoneNumber) : null;
          if (canonical && canonical !== user.phoneNumber) {
            await db
              .update(users)
              .set({ phoneNumber: canonical })
              .where(eq(users.id, user.id));
          }
          const existing = await db
            .select({ id: renters.id })
            .from(renters)
            .where(eq(renters.userId, user.id))
            .limit(1);
          if (existing.length > 0) return;

          if (canonical) {
            const linked = await db
              .update(renters)
              .set({ userId: user.id })
              .where(and(eq(renters.phone, canonical), isNull(renters.userId)))
              .returning({ id: renters.id });
            if (linked.length > 0) return;
          }
          await db
            .insert(renters)
            .values({ userId: user.id, phone: canonical })
            .onConflictDoNothing();
        },
        signUpOnVerification: {
          // Renters sign up by phone (A-10); BA requires a placeholder email.
          getTempEmail: (p) => `phone.${normalizePhone(p).replace(/\+/g, "")}@renters.jambi.local`,
        },
      }),
    ],
  });

  return { auth };
}
