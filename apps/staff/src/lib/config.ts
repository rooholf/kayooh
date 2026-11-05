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
};
