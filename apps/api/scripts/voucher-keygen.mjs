#!/usr/bin/env node
/* global process, Buffer, console: false */
/**
 * Generate an Ed25519 voucher signing keypair (FR-SEC-01.4).
 *
 * Usage:  node apps/api/scripts/voucher-keygen.mjs [kid]
 *
 * Prints a `.env` block (secret — never commit) and the JWKS entry for the
 * public key (public — goes into `apps/staff/src/lib/voucher-jwks.json` so
 * the staff app's offline pre-check can verify vouchers without network).
 *
 * Server env contract:
 *   VOUCHER_ED25519_SECRET_KEY=<printed hex seed>
 *   VOUCHER_KID=<kid>                      (default "k1")
 */
import { getPublicKey, hashes, utils, etc } from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";

hashes.sha512 = sha512;

const kid = process.argv[2] ?? "k1";
const seed = utils.randomSecretKey();
const publicKey = getPublicKey(seed);
const jwk = { kid, kty: "OKP", crv: "Ed25519", x: Buffer.from(publicKey).toString("base64url") };

console.log(`# kayooh voucher signing key — FR-SEC-01.4. KEEP THE SECRET OUT OF THE REPO.`);
console.log("VOUCHER_KID=" + kid);
console.log(`VOUCHER_ED25519_SECRET_KEY=${etc.bytesToHex(seed)}`);
console.log("");
console.log(`# JWKS entry — add to apps/staff/src/lib/voucher-jwks.json ("keys"):`);
console.log(JSON.stringify(jwk, null, 2));
