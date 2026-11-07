/**
 * Reservation-scoped guest access tokens (SRS rev 1.2 A-18). A guest booking
 * has no session; the guest reads back one reservation through a signed,
 * reservation-scoped token returned in the 201 response and delivered by
 * WhatsApp. The token grants `GET /reservations/{id}` and the voucher endpoint
 * for that reservation only (a guest token is not a session and never lists).
 *
 * Wire format mirrors lib/voucher.ts (FR-SEC-01): `v1.<reservationId>.<expUnix>.<hex(hmacSha256(secret, first 3)>)`.
 * Unlike the short-lived QR voucher, a guest token must outlive the rental, so
 * it carries a long TTL (30 days) and is verified against the server clock.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const VERSION = "v1";
/** Long enough to cover a reservation through check-in and voucher refetch. */
export const GUEST_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secret(): string {
  // Secrets live in env only (A-14); distinct from the QR voucher secret.
  return process.env.GUEST_TOKEN_SECRET ?? process.env.BETTER_AUTH_SECRET ?? "dev-insecure-guest-token-secret";
}

function hmacOf(prefix: string): string {
  return createHmac("sha256", secret()).update(prefix).digest("hex");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function signGuestToken(input: { reservationId: string; expiresAt: Date }): string {
  const exp = Math.floor(input.expiresAt.getTime() / 1000);
  const prefix = `${VERSION}.${input.reservationId}.${exp}`;
  return `${prefix}.${hmacOf(prefix)}`;
}

export type GuestTokenVerification =
  | { ok: true; reservationId: string }
  | { ok: false; code: "GUEST_TOKEN_INVALID" | "GUEST_TOKEN_EXPIRED" };

export function verifyGuestToken(token: unknown, now: Date = new Date()): GuestTokenVerification {
  if (typeof token !== "string") return { ok: false, code: "GUEST_TOKEN_INVALID" };
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return { ok: false, code: "GUEST_TOKEN_INVALID" };
  const reservationId = parts[1] ?? "";
  const expRaw = parts[2] ?? "";
  const sigRaw = parts[3] ?? "";
  if (!UUID_RE.test(reservationId) || !/^\d+$/.test(expRaw)) {
    return { ok: false, code: "GUEST_TOKEN_INVALID" };
  }
  const expectedHex = hmacOf(`${VERSION}.${reservationId}.${expRaw}`);
  const a = Buffer.from(sigRaw, "hex");
  const b = Buffer.from(expectedHex, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, code: "GUEST_TOKEN_INVALID" };
  }
  if (now.getTime() / 1000 > Number(expRaw)) {
    return { ok: false, code: "GUEST_TOKEN_EXPIRED" };
  }
  return { ok: true, reservationId };
}
