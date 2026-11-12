/**
 * Values the SRS says must come from server config (PRODUCT.md: never hard-code).
 * These are the local defaults until `GET /config` is wired.
 */
export const staffConfig = {
  /** FR-RNT-01 / V-CHECKLIST: the fixed six-item condition checklist (A-02). */
  checklistItems: [
    "frame",
    "brakes",
    "tires",
    "chain",
    "saddle",
    "handlebar_gears",
  ] as const,
  /** Human-readable labels for the fixed checklist items (UI only). */
  checklistLabels: {
    frame: "Rangka",
    brakes: "Rem",
    tires: "Ban & roda",
    chain: "Rantai & gir",
    saddle: "Sadel",
    handlebar_gears: "Setang & gigi",
  } as const,
  /** FR-RNT-01: photo count bounds for a check-out condition record. */
  minPhotos: 1,
  maxPhotos: 8,
  /** Voucher token (compact JWT) max length. */
  voucherTokenMaxLength: 2048,
  /**
   * FR-SEC-01.3: bike-tag HMAC-SHA256 pre-check. The secret is injected at
   * build time (`VITE_TAG_HMAC_SECRET`) — the dev default is for the offline
   * dev loop only; production builds get the tag key from the build env,
   * never from the repo (FR-SEC-01.4).
   */
  tagHmac: {
    keyId: import.meta.env.VITE_TAG_HMAC_KID ?? "k1",
    secret: import.meta.env.VITE_TAG_HMAC_SECRET ?? "dev-insecure-tag-hmac-secret",
    revokedKeyIds: String(import.meta.env.VITE_TAG_HMAC_REVOKED_KEYS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  },
};
