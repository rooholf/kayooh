/**
 * WIB (UTC+7) schedule math for the reservation sheet.
 *
 * Everything the renter picks is a WIB wall-clock slot; the API expects a UTC
 * instant ending in Z (V-TS). These helpers are the one place that converts
 * between the two, so the grid the renter taps and the instant the server
 * receives can never drift.
 */
import { SLOT_MINUTES } from "./config";

const WIB = "Asia/Jakarta";
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** WIB calendar date key "YYYY-MM-DD" for an instant. */
export function wibDateKey(date: Date): string {
  const shifted = new Date(date.getTime() + WIB_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The UTC instant for a WIB wall-clock date + "HH:MM". */
export function wibInstant(dateKey: string, hhmm: string): Date {
  const [y = 1970, m = 1, d = 1] = dateKey.split("-").map((n) => Number.parseInt(n, 10));
  const [hh = 0, mm = 0] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d, hh - 7, mm));
}

/** Start times ("HH:MM") every SLOT_MINUTES inside [open, close). */
export function slotsBetween(open: string, close: string): string[] {
  const [oh = 0, om = 0] = open.split(":").map((n) => Number.parseInt(n, 10));
  const [ch = 0, cm = 0] = close.split(":").map((n) => Number.parseInt(n, 10));
  const out: string[] = [];
  for (let t = oh * 60 + om; t < ch * 60 + cm; t += SLOT_MINUTES) {
    const hh = String(Math.floor(t / 60)).padStart(2, "0");
    const mm = String(t % 60).padStart(2, "0");
    out.push(`${hh}:${mm}`);
  }
  return out;
}

/** A 48-slot 07:00–19:00 grid for a day with no published hours. */
export function fallbackSlots(): string[] {
  return slotsBetween("07:00", "19:00");
}

export interface DayOption {
  /** WIB "YYYY-MM-DD". */
  key: string;
  weekday: string;
  dayMonth: string;
}

/** Today plus up to MAX_ADVANCE_DAYS, in WIB. */
export function dayOptions(
  now: Date,
  maxAdvanceDays: number,
): DayOption[] {
  const out: DayOption[] = [];
  for (let i = 0; i <= maxAdvanceDays; i += 1) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    out.push({
      key: wibDateKey(d),
      weekday: new Intl.DateTimeFormat("id-ID", { timeZone: WIB, weekday: "short" })
        .format(d)
        .toUpperCase(),
      dayMonth: new Intl.DateTimeFormat("id-ID", { timeZone: WIB, day: "2-digit", month: "2-digit" }).format(d),
    });
  }
  return out;
}

/** "07.00" from an ISO instant. */
export function wibTime(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(iso))
    .replace(":", ".");
}

/** "07/11" from an ISO instant. */
export function wibDayMonth(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB,
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(iso));
}

/** "SELASA" from an ISO instant. */
export function wibWeekday(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: WIB, weekday: "long" })
    .format(new Date(iso))
    .toUpperCase();
}

/** "14.30–16.30" for a reservation window. */
export function windowLabel(startsAt: string, endsAt: string): string {
  return `${wibTime(startsAt)}–${wibTime(endsAt)}`;
}
