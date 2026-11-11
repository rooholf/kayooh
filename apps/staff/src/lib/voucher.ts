/**
 * Offline voucher + bike-tag pre-checks (FR-SEC-01, plan A.3). Everything here
 * runs on-device with no network:
 *
 * - `verifyVoucherOffline` verifies the EdDSA JWT against the BUNDLED JWKS
 *   (`voucher-jwks.json`, public keys only) with the SRS window
 *   `exp + 120 s >= occurredAt >= iat - 120 s` (FR-SEC-01.2).
 * - `tagHmacPrecheck` verifies a bike sticker QR's HMAC-SHA256 signature with
 *   its key id (FR-SEC-01.3); a bare typed tag is `TAG_UNVERIFIABLE`.
 *
 * The verdict is ADVISORY for the counter flow: the offline queue records the
 * event regardless (FR-OFF-01), and the server re-verifies authoritatively
 * (FR-RNT-01.1) — a copied tag is additionally useless at another outlet
 * (FR-RNT-01.3 `bike.current_outlet_id === staff outlet`).
 */
import { hashes, verify } from "@noble/ed25519";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import type { JwkOkp } from "@repo/contracts";
import bundledJwks from "./voucher-jwks.json";

// Synchronous noble API needs a SHA-512 backend (no WebCrypto Ed25519 in
// Node 24 / most browsers); pure JS, same primitives on both sides of the wire.
if (!hashes.sha512) hashes.sha512 = sha512;

/**
 * The bundled public key set (public only — the secret signing seeds live in
 * the server environment, FR-SEC-01.4). Regenerated on rotation (A-07, P2).
 */
export const BUNDLED_JWKS: JwkOkp[] = (bundledJwks as { keys: JwkOkp[] }).keys;

export type VoucherPrecheck =
  | { ok: true; reservationId: string; exp: number }
  | { ok: false; code: "VOUCHER_INVALID" | "VOUCHER_EXPIRED" };

const TOLERANCE_SECONDS = 120;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;

/* Unpadded base64url, browser-safe (no atob padding edge cases, no Node). */
const B64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64URL_LOOKUP: number[] = new Array(128).fill(-1);
for (let i = 0; i < B64URL_ALPHABET.length; i += 1) B64URL_LOOKUP[B64URL_ALPHABET.charCodeAt(i)] = i;

function fromB64url(segment: string): Uint8Array | null {
  if (!B64URL_RE.test(segment)) return null;
  const n = segment.length;
  if (n === 0 || n % 4 === 1) return null; // never a valid base64 length
  const fullGroups = n >> 2;
  const rem = n % 4; // 0, 2, or 3
  const out = new Uint8Array(fullGroups * 3 + (rem === 2 ? 1 : rem === 3 ? 2 : 0));
  let o = 0;
  for (let g = 0; g < fullGroups; g += 1) {
    const c0 = B64URL_LOOKUP[segment.charCodeAt(g * 4)] ?? -1;
    const c1 = B64URL_LOOKUP[segment.charCodeAt(g * 4 + 1)] ?? -1;
    const c2 = B64URL_LOOKUP[segment.charCodeAt(g * 4 + 2)] ?? -1;
    const c3 = B64URL_LOOKUP[segment.charCodeAt(g * 4 + 3)] ?? -1;
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) return null;
    out[o++] = (c0 << 2) | (c1 >> 4);
    out[o++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
    out[o++] = ((c2 & 0x03) << 6) | c3;
  }
  if (rem === 2) {
    const c0 = B64URL_LOOKUP[segment.charCodeAt(n - 2)] ?? -1;
    const c1 = B64URL_LOOKUP[segment.charCodeAt(n - 1)] ?? -1;
    if (c0 < 0 || c1 < 0) return null;
    out[o++] = (c0 << 2) | (c1 >> 4);
  } else if (rem === 3) {
    const c0 = B64URL_LOOKUP[segment.charCodeAt(n - 3)] ?? -1;
    const c1 = B64URL_LOOKUP[segment.charCodeAt(n - 2)] ?? -1;
    const c2 = B64URL_LOOKUP[segment.charCodeAt(n - 1)] ?? -1;
    if (c0 < 0 || c1 < 0 || c2 < 0) return null;
    out[o++] = (c0 << 2) | (c1 >> 4);
    out[o++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
  }
  return out;
}

function jsonFromB64url(segment: string): Record<string, unknown> | null {
  if (!B64URL_RE.test(segment)) return null;
  const bytes = fromB64url(segment);
  if (!bytes) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Voucher pre-check against the bundled JWKS (FR-SEC-01.1/01.2).
 * `occurredAtMs` = device time of the scan; `jwks` is injectable for tests.
 */
export function verifyVoucherOffline(token: string, occurredAtMs: number, jwks: JwkOkp[] = BUNDLED_JWKS): VoucherPrecheck {
  const invalid = (): VoucherPrecheck => ({ ok: false, code: "VOUCHER_INVALID" });
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

  const key = jwks.find((k) => k.kid === header.kid);
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
  const t = occurredAtMs / 1000;
  if (t > exp + TOLERANCE_SECONDS) return { ok: false, code: "VOUCHER_EXPIRED" };
  if (t < iat - TOLERANCE_SECONDS) return invalid();
  return { ok: true, reservationId, exp };
}

/* ------------------------------------------------------------------ */
/* Bike-tag HMAC-SHA256 pre-check (FR-SEC-01.3, plan A.3.3)           */
/* ------------------------------------------------------------------ */

export interface TagHmacConfig {
  /** Key id of the currently-issued stickers. */
  keyId: string;
  /** HMAC-SHA256 secret for `keyId` (build-time env; never in the repo). */
  secret: string;
  /** Key ids revoked by rotation (A-07): tags under these are rejected. */
  revokedKeyIds: string[];
}

export type TagPrecheck =
  | { ok: true; assetTag: string; keyId: string }
  | {
      ok: false;
      code: "TAG_MALFORMED" | "TAG_REVOKED_KEY" | "TAG_HMAC_MISMATCH" | "TAG_UNVERIFIABLE";
      assetTag?: string;
    };

const TAG_HMAC_HEX_RE = /^[0-9a-f]{64}$/i;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** Constant-time compare (avoids leaking the length of a good tag's HMAC). */
function ctEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function tagHmac(secret: string, assetTag: string): Uint8Array {
  return hmac.create(sha256, new TextEncoder().encode(secret)).update(new TextEncoder().encode(assetTag)).digest();
}

/**
 * Sticker QR wire format: `<assetTag>|<keyId>|<hex hmac_sha256(secret, assetTag)>`.
 *
 * - Bare asset tag (typed manually): `TAG_UNVERIFIABLE` — no signature on the
 *   device; the server (outlet + quantity checks) stays authoritative.
 * - `keyId` other than the active key: `TAG_REVOKED_KEY` when revoked, else
 *   `TAG_UNVERIFIABLE` (this device does not hold that key's secret).
 */
export function tagHmacPrecheck(scanned: string, cfg: TagHmacConfig): TagPrecheck {
  const value = scanned.trim();
  const parts = value.split("|");
  if (parts.length < 2) {
    return { ok: false, code: "TAG_UNVERIFIABLE", assetTag: value.toUpperCase() };
  }
  const [assetTag, keyId, hmacHex] = parts as [string, string, string];
  if (parts.length !== 3 || !TAG_HMAC_HEX_RE.test(hmacHex ?? "")) {
    return { ok: false, code: "TAG_MALFORMED", assetTag: assetTag.toUpperCase() };
  }
  if (cfg.revokedKeyIds.includes(keyId)) {
    return { ok: false, code: "TAG_REVOKED_KEY", assetTag: assetTag.toUpperCase() };
  }
  if (keyId !== cfg.keyId) {
    return { ok: false, code: "TAG_UNVERIFIABLE", assetTag: assetTag.toUpperCase() };
  }
  const actual = hexToBytes(hmacHex);
  if (!ctEqual(tagHmac(cfg.secret, assetTag), actual)) {
    return { ok: false, code: "TAG_HMAC_MISMATCH", assetTag: assetTag.toUpperCase() };
  }
  return { ok: true, assetTag: assetTag.toUpperCase(), keyId };
}
