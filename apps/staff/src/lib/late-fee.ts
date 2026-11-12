import { staffConfig } from "./config";

/**
 * FR-RNT-02.4 late-fee preview — mirrors the server check-in handler
 * formula: zero inside the grace window, otherwise one fee block per
 * STARTED 30 minutes beyond grace (AC: 16 min late -> 1 block,
 * 61 min -> 2 blocks). Advisory only: the authoritative fee is computed
 * server-side at sync from the rental's `expected_end_at`.
 */
export function estimateLateFeeIdr(
  lateMinutes: number,
  graceMinutes: number = staffConfig.lateGraceMinutes,
  feePer30MinIdr: number = staffConfig.lateFeePer30MinIdr,
): number {
  const beyondGrace = lateMinutes - graceMinutes;
  if (beyondGrace <= 0) return 0;
  return Math.ceil(beyondGrace / 30) * feePer30MinIdr;
}

/** "Rp 20.000" — thousands in dot per id-ID convention. */
export function formatIdr(amountIdr: number): string {
  return new Intl.NumberFormat("id-ID").format(amountIdr);
}
