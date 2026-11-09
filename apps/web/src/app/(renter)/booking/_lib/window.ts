/**
 * Default booking window for the link-in-bio funnel (revision 1.3).
 *
 * "Book Now!!" must drop the renter into a checkout where the only required
 * input is the phone — so both the landing and the checkout prefill the same
 * window: the first bookable 15-minute slot of the default duration, starting
 * today (WIB), else the first day within the advance horizon that has one.
 *
 * The server stays the only authority: whatever the client computes is re-
 * validated (422 WINDOW_OUT_OF_RANGE / DURATION_OUT_OF_RANGE); INV-2 lock
 * decides at commit. Pure functions only — usable from the server component
 * and the checkout alike.
 */
import { intervalsForDay } from "../../_components/shared";
import { dayOptions, slotsBetween, wibDateKey, wibInstant, type DayOption } from "../../reservasi/_lib/schedule";
import { MAX_ADVANCE_DAYS } from "../../reservasi/_lib/config";

/** Default checkout duration: the first preset (2 jam matches the checkout). */
export const DEFAULT_DURATION_MINUTES = 120;

interface Interval {
  open: string;
  close: string;
}

const toMin = (hhmm: string): number => {
  const [h = 0, m = 0] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  return h * 60 + m;
};

/** Opening intervals for one WIB day; an unknown shape falls back to 07:00–19:00. */
export function dayIntervals(hours: unknown, dayKey: string): Interval[] {
  const raw = intervalsForDay(hours, wibInstant(dayKey, "12:00"));
  return raw === null ? [{ open: "07:00", close: "19:00" }] : raw;
}

/** A window starting at `start` must open at/after `open` and end by `close`. */
export function fitsWindow(start: string, durationMin: number, intervals: Interval[]): boolean {
  const s = toMin(start);
  return intervals.some((iv) => s >= toMin(iv.open) && s + durationMin <= toMin(iv.close));
}

/**
 * All 15-minute starts inside the day's opening hours, plus the set that cannot
 * be booked for this window (past, or ending after close). Closed starts stay
 * visible and struck — never hidden (brief: honest states).
 */
export function slotsForDay(
  hours: unknown,
  dayKey: string,
  durationMin: number,
  now: Date,
): { slots: string[]; closed: Set<string> } {
  const intervals = dayIntervals(hours, dayKey);
  const all = new Set<string>();
  for (const iv of intervals) {
    for (const s of slotsBetween(iv.open, iv.close)) all.add(s);
  }
  const slots = [...all].sort();
  const closed = new Set<string>();
  for (const s of slots) {
    const past = wibInstant(dayKey, s).getTime() <= now.getTime();
    if (past || !fitsWindow(s, durationMin, intervals)) closed.add(s);
  }
  return { slots, closed };
}

/** First non-struck start of a day, or null when the whole day is closed/past. */
export function firstBookableSlot(
  hours: unknown,
  dayKey: string,
  durationMin: number,
  now: Date,
): string | null {
  const { slots, closed } = slotsForDay(hours, dayKey, durationMin, now);
  return slots.find((s) => !closed.has(s)) ?? null;
}

export interface DefaultWindow {
  dayKey: string;
  slot: string;
  startsAt: Date;
  endsAt: Date;
}

/**
 * {"today, first bookable slot @ default duration", else the first day within
 * MAX_ADVANCE_DAYS that has one}. Null when the outlet has no opening slot at
 * all in the horizon (checked-out hours shape, etc.) — the caller then shows
 * the honest notice instead of a made-up window.
 */
export function defaultWindow(
  hours: unknown,
  now: Date,
  durationMin: number = DEFAULT_DURATION_MINUTES,
  days?: DayOption[],
): DefaultWindow | null {
  const candidates = days ?? dayOptions(now, MAX_ADVANCE_DAYS);
  const keys = [wibDateKey(now), ...candidates.map((d) => d.key)];
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const slot = firstBookableSlot(hours, key, durationMin, now);
    if (slot !== null) {
      const startsAt = wibInstant(key, slot);
      return {
        dayKey: key,
        slot,
        startsAt,
        endsAt: new Date(startsAt.getTime() + durationMin * 60_000),
      };
    }
  }
  return null;
}
