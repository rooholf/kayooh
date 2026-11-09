/**
 * Reservation-surface constants.
 *
 * These MIRROR the SRS §4 seed defaults held by the API
 * (`apps/api/src/modules/app-config/index.ts` → CONFIG_DEFAULTS). There is no
 * public config endpoint yet, so the client keeps its own copy to render the
 * slot grid and duration presets. The server stays the single authority: any
 * window it disagrees with comes back as a 422 and the surface says so.
 */
export const SLOT_MINUTES = 60;
export const MIN_DURATION_MINUTES = 60;
export const MAX_DURATION_MINUTES = 1440;
export const MAX_ADVANCE_DAYS = 7;
export const MAX_QUANTITY = 5;
export const HOLD_CHECKOUT_MINUTES = 15;
export const MAX_ACTIVE_RESERVATIONS_PER_PHONE = 3;
export const QR_VOUCHER_TTL_SECONDS = 60;

/** FR-SEC-01.1: the renter app refetches the voucher every `ttl/2` seconds. */
export const VOUCHER_REFETCH_MS = (QR_VOUCHER_TTL_SECONDS / 2) * 1000;

/** Rows per page for the `GET /reservations` cursor list (SRS 3.2 / V-LIMIT). */
export const LIST_PAGE_SIZE = 25;

/** Duration presets in minutes (1j · 2j · 4j · 8j). */
export const DURATION_PRESETS = [60, 120, 240, 480] as const;

/** "1 jam 30 menit" / "8 jam" — Indonesian duration words. */
export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} menit`;
  if (rest === 0) return `${hours} jam`;
  return `${hours} jam ${rest} menit`;
}

export function isDurationPreset(minutes: number): boolean {
  return (DURATION_PRESETS as readonly number[]).includes(minutes);
}
