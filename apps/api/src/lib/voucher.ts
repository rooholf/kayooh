/**
 * Signed QR voucher tokens (FR-SEC-01.1, SRS v1.3): a compact EdDSA JWT.
 *
 *   header  {"alg":"EdDSA","kid":"<key id>"}
 *   payload {"v":1,"rid":"<reservation>","nonce":"<hex>","iat":<sec>,"exp":<sec>}
 *   wire    base64url(header).base64url(payload).base64url(Ed25519 signature)
 *
 * Verification window (FR-SEC-01.2): `exp + 120 s >= occurredAt >= iat - 120 s`,
 * where `occurredAt` is the staff device time (devices drift, SRS 3.1).
 *
 * Key management (FR-SEC-01.4): the Ed25519 signing seed lives in the
 * environment only, never in the repo:
 *   VOUCHER_ED25519_SECRET_KEY — 32-byte seed, hex or base64
 *                                (generate one with `node apps/api/scripts/voucher-keygen.mjs`;
 *                                the printed public key goes into the JWKS that the
 *                                staff app bundles for its offline pre-check)
 *   VOUCHER_KID — key id (default "k1"; rotation arrives with A-07 in P2)
 *
 * Without the env seed (dev/tests) an EPHEMERAL key is used: signing and
 * verification then only work within one process. Production must set the
 * env secret; a malformed one fails fast at module load.
 */
import { randomBytes } from "node:crypto";
import { etc, getPublicKey, hashes, sign, utils, verify } from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import type { JwkOkp } from "@repo/contracts";

// The synchronous noble API needs a SHA-512 backend (Node's WebCrypto has no
// Ed25519); @noble/hashes keeps this pure-JS and identical on the staff side.
if (!hashes.sha512) hashes.sha512 = sha512;

const TOLERANCE_SECONDS = 120;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;

interface SigningKey {
  kid: string;
  seed: Uint8Array;
  jwk: JwkOkp;
}

function jwkOf(kid: string, seed: Uint8Array): JwkOkp {
  return { kid, kty: "OKP", crv: "Ed25519", x: Buffer.from(getPublicKey(seed)).toString("base64url") };
}

function decodeSeed(raw: string): Uint8Array | null {
  const s = raw.trim();
  if (/^[0-9a-f]{64}$/i.test(s)) return etc.hexToBytes(s.toLowerCase());
  if (/^[A-Za-z0-9+/]{40,48}={0,2}$/.test(s)) {
    const bytes = Buffer.from(s, "base64");
    return bytes.length === 32 ? new Uint8Array(bytes) : null;
  }
  return null;
}

function loadSigningKey(): SigningKey {
  const raw = process.env.VOUCHER_ED25519_SECRET_KEY;
  if (raw && raw.trim()) {
    const seed = decodeSeed(raw);
    if (!seed) throw new Error("VOUCHER_ED25519_SECRET_KEY must be a 32-byte seed (hex or base64)");
    const kid = process.env.VOUCHER_KID ?? "k1";
    return { kid, seed, jwk: jwkOf(kid, seed) };
  }
  // No secret in env (dev/tests): ephemeral key so sign + verify stay in-process.
  const seed = utils.randomSecretKey();
  const kid = `ephemeral-${etc.bytesToHex(randomBytes(4))}`;
  console.warn(`[voucher] VOUCHER_ED25519_SECRET_KEY unset — using EPHEMERAL key "${kid}" (dev only; see scripts/voucher-keygen.mjs).`);
  return { kid, seed, jwk: jwkOf(kid, seed) };
}

const KEY: SigningKey = loadSigningKey();

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromB64url(segment: string): Uint8Array | null {
  if (!B64URL_RE.test(segment)) return null;
  const bytes = Buffer.from(segment, "base64url");
  return new Uint8Array(bytes);
}

function jsonFromB64url(segment: string): Record<string, unknown> | null {
  const bytes = fromB64url(segment);
  if (!bytes) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function signVoucher(input: { reservationId: string; expiresAt: Date; nonce?: string }): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = Math.floor(input.expiresAt.getTime() / 1000);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "EdDSA", kid: KEY.kid })));
  const payload = b64url(
    new TextEncoder().encode(
      JSON.stringify({ v: 1, rid: input.reservationId, nonce: input.nonce ?? etc.bytesToHex(randomBytes(8)), iat, exp }),
    ),
  );
  const signature = sign(new TextEncoder().encode(`${header}.${payload}`), KEY.seed);
  return `${header}.${payload}.${b64url(signature)}`;
}

/** The server's currently-active public key (JWKS entry; public only). */
export function voucherJwks(): JwkOkp[] {
  return [KEY.jwk];
}

export type VoucherVerification =
  | { ok: true; reservationId: string; exp: number }
  | { ok: false; code: "VOUCHER_INVALID" | "VOUCHER_EXPIRED" };

/**
 * Authoritative server-side verification (FR-RNT-01.1). `jwks` defaults to the
 * active key; pass a set to verify against rotated/other keys.
 */
export function verifyVoucher(token: unknown, occurredAt: Date, jwks: JwkOkp[] = [KEY.jwk]): VoucherVerification {
  const invalid = (): VoucherVerification => ({ ok: false, code: "VOUCHER_INVALID" });
  if (typeof token !== "string") return invalid();
  const parts = token.split(".");
  if (parts.length !== 3) return invalid();
  const [headSeg, payloadSeg, sigSeg] = parts as [string, string, string];
  const header = jsonFromB64url(headSeg);
  if (!header || header.alg !== "EdDSA" || typeof header.kid !== "string") return invalid();
  const payload = jsonFromB64url(payloadSeg);
  if (!payload) return invalid();
  if (payload.v !== 1) return invalid();
  const reservationId = payload.rid;
  if (typeof reservationId !== "string" || !UUID_RE.test(reservationId)) return invalid();
  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) return invalid();
  const iat = payload.iat as number;
  const exp = payload.exp as number;

  // Unknown kid (never issued or revoked via A-07) -> invalid.
  const key = jwks.find((k) => k.kid === (header.kid as string));
  if (!key) return invalid();
  const signature = fromB64url(sigSeg);
  const publicKey = fromB64url(key.x);
  if (!signature || signature.length !== 64 || !publicKey || publicKey.length !== 32) return invalid();
  let signatureOk = false;
  try {
    signatureOk = verify(signature, new TextEncoder().encode(`${headSeg}.${payloadSeg}`), publicKey);
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) return invalid();

  // FR-SEC-01.2 window: exp + 120 s >= occurredAt >= iat - 120 s.
  const t = occurredAt.getTime() / 1000;
  if (t > exp + TOLERANCE_SECONDS) return { ok: false, code: "VOUCHER_EXPIRED" };
  if (t < iat - TOLERANCE_SECONDS) return invalid();
  return { ok: true, reservationId, exp };
}
