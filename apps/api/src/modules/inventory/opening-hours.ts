/**
 * Opening hours bookkeeping (SRS 3.4 V-HOURS, FR-INV-02 steps 2-3).
 * hours are interpreted in Asia/Jakarta (WIB, UTC+7 — SRS 3.1). WIB has no
 * DST, so shifting the UTC instant by +7 h and reading the UTC fields gives
 * the WIB wall clock. Intervals are half-open [open, close) minutes-of-day;
 * open < close per V-HOURS, so no interval crosses midnight.
 */
import { z } from "zod";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export const h2m = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  if (h === undefined || m === undefined || !Number.isInteger(h) || !Number.isInteger(m)) {
    return -1;
  }
  return h * 60 + m;
};

export const openingHoursSchema = z.record(
  z.enum(DAY_KEYS),
  z.array(
    z.object({
      open: z.string().regex(/^\d{2}:\d{2}$/),
      close: z.string().regex(/^\d{2}:\d{2}$/),
    }),
  ),
);

/** WIB instant metadata without constructing wall-clock strings. */
export function wibMinuteOfDay(instant: Date): { dayIndex: number; minutes: number; absolute: number } {
  // NEG-4 note: derived locally; no coordinates involved.
  const shifted = new Date(instant.getTime() + 7 * 60 * 60 * 1000);
  const absolute = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return {
    dayIndex: shifted.getUTCDay(),
    minutes: absolute,
    absolute,
  };
}

/** True when the instant falls in an open interval of the outlet, WIB. */
export function isOpenAt(hours: unknown, instant: Date): boolean {
  const parsed = openingHoursSchema.safeParse(hours);
  if (!parsed.success) return false; // bad data can never widen availability
  const dayKey = DAY_KEYS[wibMinuteOfDay(instant).dayIndex] ?? "sun";
  const intervals = parsed.data[dayKey] ?? [];
  const minutes = wibMinuteOfDay(instant).minutes;
  return intervals.some((iv: { open: string; close: string }) => {
    const open = h2m(iv.open);
    const close = h2m(iv.close);
    if (open < 0 || close < 0) return false;
    return minutes >= open && minutes < close;
  });
}

/** Slot alignment (FR-INV-02.2): whole minutes, no stray seconds, multiple of slot. */
export function isSlotAligned(instant: Date, slotMinutes: number): boolean {
  return (
    instant.getUTCSeconds() === 0 &&
    instant.getUTCMilliseconds() === 0 &&
    instant.getUTCMinutes() % slotMinutes === 0
  );
}
