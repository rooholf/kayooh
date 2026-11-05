/**
 * Values the SRS says must come from server config (PRODUCT.md: never hard-code).
 * These are the local defaults until `GET /config` is wired.
 */
export const staffConfig = {
  checklistItems: ["Roda & ban", "Rem", "Rantai & gir"] as const,
  /** FR-RNT-01: photo count bounds for a check-out condition record. */
  minPhotos: 1,
  maxPhotos: 3,
};
