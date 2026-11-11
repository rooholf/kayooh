/**
 * FR-SEC-01.1/01.2 unit tests for the EdDSA voucher JWT (no DB).
 * Signs and verifies in-process; the signing key is the module's active key
 * (env seed when present, ephemeral otherwise).
 */
import { signVoucher, verifyVoucher, voucherJwks } from "../src/lib/voucher.js";
import { describe, expect, it } from "vitest";

const RID = "3f2f5f6e-1111-4222-8333-944455556666";

function payloadOf(token: string): Record<string, unknown> {
  const [, payloadSeg] = token.split(".") as [string, string];
  return JSON.parse(Buffer.from(payloadSeg, "base64url").toString("utf8")) as Record<string, unknown>;
}

function headerOf(token: string): Record<string, unknown> {
  const [headSeg] = token.split(".") as [string];
  return JSON.parse(Buffer.from(headSeg, "base64url").toString("utf8")) as Record<string, unknown>;
}

function freshToken(offsetMs = 0): { token: string; iat: number; exp: number } {
  const token = signVoucher({ reservationId: RID, expiresAt: new Date(Date.now() + offsetMs + 15 * 60_000) });
  const claims = payloadOf(token);
  return { token, iat: claims.iat as number, exp: claims.exp as number };
}

describe("signVoucher — compact EdDSA JWT (FR-SEC-01.1)", () => {
  it("emits a 3-segment JWT with EdDSA header and v1 claims", () => {
    const { token } = freshToken();
    const [head, payload, sig] = token.split(".") as [string, string, string];
    const header = headerOf(token);
    const claims = payloadOf(token);
    expect(header).toMatchObject({ alg: "EdDSA" });
    expect(typeof header.kid).toBe("string");
    expect(claims.v).toBe(1);
    expect(claims.rid).toBe(RID);
    expect(typeof claims.nonce).toBe("string");
    expect(Number.isInteger(claims.iat)).toBe(true);
    expect(Number.isInteger(claims.exp)).toBe(true);
    // base64url, unpadded, 64-byte signature -> 86 chars.
    expect(head).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sig).toHaveLength(86);
  });

  it("respects an explicit nonce", () => {
    const token = signVoucher({ reservationId: RID, expiresAt: new Date(Date.now() + 900_000), nonce: "00c0ffee" });
    expect(payloadOf(token).nonce).toBe("00c0ffee");
  });
});

describe("verifyVoucher — window + signature (FR-SEC-01.2)", () => {
  it("accepts a fresh token and returns the reservation id", () => {
    const { token } = freshToken();
    expect(verifyVoucher(token, new Date())).toMatchObject({ ok: true, reservationId: RID });
  });

  it("honours the 120 s tolerance on both ends", () => {
    const { token, iat, exp } = freshToken();
    expect(verifyVoucher(token, new Date((exp + 120) * 1000)).ok).toBe(true); // upper bound inclusive
    expect(verifyVoucher(token, new Date((exp + 121) * 1000))).toMatchObject({ ok: false, code: "VOUCHER_EXPIRED" });
    expect(verifyVoucher(token, new Date((iat - 120) * 1000)).ok).toBe(true); // lower bound inclusive
    expect(verifyVoucher(token, new Date((iat - 121) * 1000))).toMatchObject({ ok: false, code: "VOUCHER_INVALID" });
  });

  it("rejects a tampered payload or signature", () => {
    const { token } = freshToken();
    const [head, payload, sig] = token.split(".") as [string, string, string];
    const flipped = payload[0] === "A" ? `B${payload.slice(1)}` : `A${payload.slice(1)}`;
    expect(verifyVoucher(`${head}.${flipped}.${sig}`, new Date())).toMatchObject({ ok: false, code: "VOUCHER_INVALID" });
    const flippedSig = sig[0] === "A" ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
    expect(verifyVoucher(`${head}.${payload}.${flippedSig}`, new Date())).toMatchObject({ ok: false, code: "VOUCHER_INVALID" });
  });

  it("rejects unknown kid, legacy v1. HMAC tokens, and non-strings", () => {
    const { token, exp } = freshToken();
    const foreign = [{ kid: "ghost", kty: "OKP" as const, crv: "Ed25519" as const, x: voucherJwks()[0]!.x }];
    expect(verifyVoucher(token, new Date(), foreign)).toMatchObject({ ok: false, code: "VOUCHER_INVALID" });
    // The pre-EdDSA wire format must no longer verify.
    expect(verifyVoucher("v1." + RID + "." + exp + ".deadbeef", new Date())).toMatchObject({
      ok: false,
      code: "VOUCHER_INVALID",
    });
    expect(verifyVoucher(undefined, new Date())).toMatchObject({ ok: false, code: "VOUCHER_INVALID" });
    expect(verifyVoucher("", new Date())).toMatchObject({ ok: false, code: "VOUCHER_INVALID" });
  });

  it("verifies against an explicit JWKS argument (authoritative re-verify)", () => {
    const { token } = freshToken();
    expect(verifyVoucher(token, new Date(), voucherJwks())).toMatchObject({ ok: true, reservationId: RID });
  });

  it("exposes the active public key only (no seed material)", () => {
    const jwk = voucherJwks()[0]!;
    expect(jwk.kty).toBe("OKP");
    expect(jwk.crv).toBe("Ed25519");
    expect(jwk.x).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
