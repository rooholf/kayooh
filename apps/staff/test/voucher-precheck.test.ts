/**
 * Offline pre-check tests (FR-SEC-01, plan A.3) — the acceptance criterion:
 * a fresh voucher is accepted and an expired/tampered one is rejected
 * WITHOUT any network, using only the bundled JWKS.
 */
import { getPublicKey, hashes, sign } from "@noble/ed25519";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { describe, expect, it } from "vitest";
import { BUNDLED_JWKS, tagHmacPrecheck, verifyVoucherOffline, type TagHmacConfig, type JwkOkp } from "../src/lib/voucher.js";

if (!hashes.sha512) hashes.sha512 = sha512;

/* Deterministic test key (fixture, not a secret in the real sense). */
const TEST_KID = "test-k1";
const TEST_SEED_HEX = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const TEST_PUBLIC = getPublicKey(new Uint8Array(Buffer.from(TEST_SEED_HEX, "hex")));
const TEST_JWKS: JwkOkp[] = [
  { kid: TEST_KID, kty: "OKP", crv: "Ed25519", x: Buffer.from(TEST_PUBLIC).toString("base64url") },
];

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const enc = (s: string) => new TextEncoder().encode(s);

function signToken(opts: { rid: string; iat: number; exp: number; kid?: string; seedHex?: string }): string {
  const seed = new Uint8Array(Buffer.from(opts.seedHex ?? TEST_SEED_HEX, "hex"));
  const header = b64url(enc(JSON.stringify({ alg: "EdDSA", kid: opts.kid ?? TEST_KID })));
  const payload = b64url(enc(JSON.stringify({ v: 1, rid: opts.rid, nonce: "abcdef", iat: opts.iat, exp: opts.exp })));
  const signature = sign(enc(`${header}.${payload}`), seed);
  return `${header}.${payload}.${b64url(signature)}`;
}

function tagMac(secret: string, tag: string): string {
  return Buffer.from(hmac.create(sha256, enc(secret)).update(enc(tag)).digest()).toString("hex");
}

const RID = "e24f5a10-7c3b-4f1a-9d2e-1a2b3c4d5e6f";
const NOW_SEC = () => Math.floor(Date.now() / 1000);

/* Regression pin: a token signed by the REAL server key "k1" (see
   apps/api/scripts/voucher-keygen.mjs). Expiry is far-future so the check
   stays valid; it proves the committed JWKS matches the live signing key. */
const PINNED_K1_TOKEN =
  "eyJhbGciOiJFZERTQSIsImtpZCI6ImsxIn0.eyJ2IjoxLCJyaWQiOiJlMjRmNWExMC03YzNiLTRmMWEtOWQyZS0xYTJiM2M0ZDVlNmYiLCJub25jZSI6IjAwYzBmZmVlIiwiaWF0IjoxNzk0NDMyNTM4LCJleHAiOjI1MzQwMjMwMDc5OX0.1w8IJ9vADaf7ORYR2iiWfrgFKBbnuQsmt33RYKK8YmFuNij4vKeK51CD1XTOlJSSiqDmU_Iqe25EwaqERd49CA";

describe("verifyVoucherOffline (bundled JWKS, no network)", () => {
  it("verifies the shape of the bundled JWKS", () => {
    expect(BUNDLED_JWKS.map((k) => k.kid)).toContain("k1");
    for (const k of BUNDLED_JWKS) {
      expect(k.kty).toBe("OKP");
      expect(k.crv).toBe("Ed25519");
      expect(k.x).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it("accepts a k1-signed voucher (regression pin against the committed JWKS)", () => {
    expect(verifyVoucherOffline(PINNED_K1_TOKEN, Date.now())).toMatchObject({ ok: true, reservationId: RID });
  });

  it("accepts a fresh voucher and rejects an expired one (120 s tolerance)", () => {
    const now = NOW_SEC();
    expect(verifyVoucherOffline(signToken({ rid: RID, iat: now, exp: now + 900 }), now * 1000, TEST_JWKS)).toMatchObject({ ok: true });
    // exp 5 minutes in the past: now > exp + 120 s -> expired.
    expect(verifyVoucherOffline(signToken({ rid: RID, iat: now - 600, exp: now - 300 }), now * 1000, TEST_JWKS)).toMatchObject({
      ok: false,
      code: "VOUCHER_EXPIRED",
    });
    // Issued "in the future" (device clock lag): now < iat - 120 s -> invalid.
    expect(verifyVoucherOffline(signToken({ rid: RID, iat: now + 600, exp: now + 1500 }), now * 1000, TEST_JWKS)).toMatchObject({
      ok: false,
      code: "VOUCHER_INVALID",
    });
  });

  it("rejects a tampered payload, an unknown kid, and garbage", () => {
    const now = NOW_SEC();
    const fresh = signToken({ rid: RID, iat: now, exp: now + 900 });
    const [head, payload, sig] = fresh.split(".") as [string, string, string];
    const tampered = `${head}.${payload.slice(0, 40)}x${payload.slice(41)}.${sig}`;
    expect(verifyVoucherOffline(tampered, now * 1000, TEST_JWKS)).toMatchObject({ ok: false, code: "VOUCHER_INVALID" });
    expect(verifyVoucherOffline(signToken({ rid: RID, iat: now, exp: now + 900, kid: "ghost" }), now * 1000, TEST_JWKS)).toMatchObject({
      ok: false,
      code: "VOUCHER_INVALID",
    });
    expect(verifyVoucherOffline("v1.not-a-reservation.99999999.deadbeef", now * 1000, TEST_JWKS)).toMatchObject({
      ok: false,
      code: "VOUCHER_INVALID",
    });
  });
});

describe("tagHmacPrecheck (FR-SEC-01.3)", () => {
  const cfg: TagHmacConfig = { keyId: "k1", secret: "s3cret-tag-key", revokedKeyIds: ["k0"] };
  const tag = "JMB-021-CMT-118";

  it("accepts a correctly signed sticker QR", () => {
    const qr = `${tag}|${cfg.keyId}|${tagMac(cfg.secret, tag)}`;
    expect(tagHmacPrecheck(qr, cfg)).toEqual({ ok: true, assetTag: tag, keyId: "k1" });
  });

  it("rejects a mismatched HMAC (forged tag)", () => {
    const forged = `${tag}|${cfg.keyId}|${"ab".repeat(32)}`;
    expect(tagHmacPrecheck(forged, cfg)).toMatchObject({ ok: false, code: "TAG_HMAC_MISMATCH", assetTag: tag });
  });

  it("rejects a revoked key id and keeps a stale (non-active) one unverifiable", () => {
    const revokedQr = `${tag}|k0|${tagMac("old-secret", tag)}`;
    expect(tagHmacPrecheck(revokedQr, cfg)).toMatchObject({ ok: false, code: "TAG_REVOKED_KEY" });
    const staleQr = `${tag}|k0.5|${tagMac("stale-secret", tag)}`;
    expect(tagHmacPrecheck(staleQr, cfg)).toMatchObject({ ok: false, code: "TAG_UNVERIFIABLE" });
  });

  it("marks a bare typed tag unverifiable and a broken payload malformed", () => {
    expect(tagHmacPrecheck(tag, cfg)).toMatchObject({ ok: false, code: "TAG_UNVERIFIABLE", assetTag: tag });
    expect(tagHmacPrecheck(`${tag}|${cfg.keyId}|nothex`, cfg)).toMatchObject({ ok: false, code: "TAG_MALFORMED" });
  });
});
