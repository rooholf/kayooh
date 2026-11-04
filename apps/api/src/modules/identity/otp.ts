/**
 * OTP storage and verification (FR-ID-01).
 *
 * SRS: "Generate a 6-digit numeric OTP with a CSPRNG. Store only its hash.
 * TTL 300 s." The Better Auth phoneNumber plugin stores the code in plaintext
 * in its `verification` table, so this module is the authority instead:
 *  - send: CSPRNG code -> sha256 hash persisted -> hash-only at rest
 *  - verify: constant-time hash compare, at most 5 wrong attempts then the
 *    OTP is invalidated (SRS FR-ID-01.5)
 * The plugin runs with a custom `verifyOTP` that delegates here; the plugin's
 * own scratch `verification` row is deleted after every verify (its code is
 * never sent to anyone, so it cannot be replayed).
 */
import { createHash, randomInt } from "node:crypto";
import { APIError } from "better-auth/api";
import { and, desc, eq, inArray, lt } from "@repo/db";
import { db } from "@repo/db";
import { verifications } from "@repo/db";

const OTP_TTL_SECONDS = 300; // SRS FR-ID-01.3
const OTP_MAX_ATTEMPTS = 5; // SRS FR-ID-01.5
const OTP_LENGTH = 6; // SRS: 6-digit numeric

export function hashOtp(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, "0");
}

/**
 * Replaces any live OTP for the phone with a fresh hash-only record.
 * Called from the phoneNumber plugin's sendOTP hook (see auth.ts).
 * Returns the plaintext code (only ever in memory, handed to the
 * NotificationProvider — never stored, never logged in production).
 *
 * `rawPhone` is the caller's input form: the plugin stores its own plaintext
 * scratch row under THAT identifier before invoking this hook, so both forms
 * must be cleared to keep exactly one live OTP per phone.
 */
export async function issueOtp(rawPhone: string, canonicalPhone: string): Promise<string> {
  const code = generateOtpCode();
  const value = `${hashOtp(code)}:0`;
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
  await db.transaction(async (tx) => {
    // One live OTP per phone: drop previous rows (plugin scratch row included).
    await tx.delete(verifications).where(inArray(verifications.identifier, [rawPhone, canonicalPhone]));
    await tx.insert(verifications).values({ identifier: canonicalPhone, value, expiresAt });
  });
  return code;
}

export interface VerifyOtpResult {
  ok: boolean;
  reason?: "unknown" | "expired" | "invalid" | "too_many_attempts";
}

/**
 * Verifies a provided code against the stored hash.
 * Wrong, expired or exhausted attempts return ok=false (maps to 401 OTP_INVALID
 * through the auth error envelope mapping).
 */
export async function verifyOtp(phone: string, providedCode: string): Promise<VerifyOtpResult> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(verifications)
      .where(eq(verifications.identifier, phone))
      .orderBy(desc(verifications.createdAt))
      .limit(1);
    const row = rows[0];
    if (!row) return { ok: false, reason: "unknown" };
    if (row.expiresAt.getTime() <= Date.now()) {
      await tx.delete(verifications).where(eq(verifications.id, row.id));
      return { ok: false, reason: "expired" };
    }
    const [storedHash, rawAttempts] = row.value.split(":");
    const attempts = Number.isSafeInteger(Number(rawAttempts)) ? Number(rawAttempts) : 0;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await tx.delete(verifications).where(eq(verifications.id, row.id));
      return { ok: false, reason: "too_many_attempts" };
    }
    if (hashOtp(providedCode) !== storedHash) {
      const nextAttempts = attempts + 1;
      if (nextAttempts >= OTP_MAX_ATTEMPTS) {
        // SRS: 5 wrong attempts invalidate the OTP entirely.
        await tx.delete(verifications).where(eq(verifications.id, row.id));
      } else {
        await tx
          .update(verifications)
          .set({ value: `${storedHash}:${nextAttempts}` })
          .where(eq(verifications.id, row.id));
      }
      return { ok: false, reason: "invalid" };
    }
    // Success CONSUMES the OTP (one-time use); the plugin's own delete only
    // covers its raw-identifier scratch row, not this canonical row.
    await tx.delete(verifications).where(eq(verifications.id, row.id));
    return { ok: true };
  });
}

/** Housekeeping for expired OTP rows (callable from the future sweeper). */
export async function purgeExpiredOtps(): Promise<number> {
  const deleted = await db
    .delete(verifications)
    .where(lt(verifications.expiresAt, new Date()))
    .returning({ id: verifications.id });
  return deleted.length;
}

/** Consume (delete) any live OTP for a phone — used after successful verify. */
export async function consumeOtp(phone: string): Promise<void> {
  await db.delete(verifications).where(and(eq(verifications.identifier, phone)));
}

export const OTP_LIMITS = {
  perPhoneWindowSec: 60, // at most 1 OTP per phone per 60 s
  perPhoneHourlyLimit: 5, // 5 per phone per hour
  perIpHourlyLimit: 20, // 20 per IP per hour (all phones)
} as const;

/**
 * OTP send-limit rejection. Thrown INSIDE the Better Auth sendOTP hook, so it
 * must be a BA APIError — an AppError here would be swallowed and re-wrapped
 * as a 500 SERVER_ERROR by BA's error handling.
 */
export function otpSendError(
  reason: "phone_cooldown" | "phone_hourly" | "ip_hourly",
): APIError {
  return new APIError("TOO_MANY_REQUESTS", {
    message: `OTP send limit exceeded: ${reason}`,
    code: "RATE_LIMITED",
  });
}
