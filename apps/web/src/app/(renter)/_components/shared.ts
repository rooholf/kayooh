import type { OutletListItem } from "@repo/contracts";

/** Fixed category order and display labels, matching the poster's ruled columns. */
export const CATEGORY_ORDER = ["commuter", "road", "mtb", "fixie"] as const;
export type CategoryCode = (typeof CATEGORY_ORDER)[number];

export const CATEGORY_LABEL: Record<CategoryCode, string> = {
  commuter: "COMMUTER",
  road: "ROAD",
  mtb: "MTB",
  fixie: "FIXIE",
};

/** Short column headers for the ruled count grid. */
export const CATEGORY_SHORT: Record<CategoryCode, string> = {
  commuter: "COM",
  road: "ROD",
  mtb: "MTB",
  fixie: "FIX",
};

export const WAKTU_ORDER = ["pagi", "siang", "sore", "malam"] as const;
export type WaktuCode = (typeof WAKTU_ORDER)[number];

export const WAKTU_LABEL: Record<WaktuCode, string> = {
  pagi: "PAGI",
  siang: "SIANG",
  sore: "SORE",
  malam: "MALAM",
};

export function isCategoryCode(value: string | null): value is CategoryCode {
  return (CATEGORY_ORDER as readonly string[]).includes(value ?? "");
}

export function isWaktuCode(value: string | null): value is WaktuCode {
  return (WAKTU_ORDER as readonly string[]).includes(value ?? "");
}

export function availabilityCount(
  outlet: OutletListItem,
  category: CategoryCode,
): number {
  const n = outlet.availability[category];
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** Sum of per-category counts the server returned — the live "siap" figure. */
export function totalUnits(outlets: OutletListItem[]): number {
  return outlets.reduce(
    (sum, outlet) =>
      sum +
      Object.values(outlet.availability).reduce((acc, n) => acc + n, 0),
    0,
  );
}

const WIB = "Asia/Jakarta";

/** "SELASA" and "05/11", computed in WIB so server and client agree. */
export function wibDateParts(now: Date = new Date()): {
  weekday: string;
  dayMonth: string;
} {
  const weekday = new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB,
    weekday: "long",
  })
    .format(now)
    .toUpperCase();
  const day = new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB,
    day: "2-digit",
    month: "2-digit",
  }).format(now);
  return { weekday, dayMonth: day };
}

/** Indonesian decimal comma for distances, e.g. "1,2 km". */
export function formatDistanceKm(km: number): string {
  return `${km.toFixed(1).replace(".", ",")} km`;
}

/** Live ready total for one category across outlets (0 = none ready). */
export function typeTotals(
  outlets: OutletListItem[],
  category: CategoryCode,
): number {
  return outlets.reduce((sum, outlet) => sum + availabilityCount(outlet, category), 0);
}

/** Outlets with at least one bike ready in the category. */
export function outletsWithType(
  outlets: OutletListItem[],
  category: CategoryCode,
): OutletListItem[] {
  return outlets.filter((outlet) => availabilityCount(outlet, category) > 0);
}

/** Display helpers shared with the specimen rows (Indonesian words). */
export const CATEGORY_WORD: Record<CategoryCode, string> = {
  commuter: "Commuter",
  road: "Road",
  mtb: "MTB",
  fixie: "Fixie",
};

/** WIB day keys matching the outlet `hours` jsonb (SRS V-HOURS). */
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type DayKey = (typeof DAY_KEYS)[number];

function isValidDayKey(value: unknown): value is DayKey {
  return (
    typeof value === "string" &&
    (DAY_KEYS as readonly string[]).includes(value)
  );
}

/** WIB (UTC+7) weekday key for an instant, matching the outlet `hours` jsonb. */
export function wibDayKey(date: Date): DayKey | null {
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const dayKey = DAY_KEYS[shifted.getUTCDay()];
  return isValidDayKey(dayKey) ? dayKey : null;
}

/**
 * Opening intervals for one WIB day from an outlet's `hours`. Unknown shapes
 * return null rather than an invented line (fail closed, never wrong).
 */
export function intervalsForDay(
  hours: unknown,
  date: Date,
): Array<{ open: string; close: string }> | null {
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) return null;
  const dayKey = wibDayKey(date);
  if (dayKey === null) return null;
  const intervals = (hours as Record<string, unknown>)[dayKey];
  if (!Array.isArray(intervals)) return null;
  const parsed: Array<{ open: string; close: string }> = [];
  for (const interval of intervals) {
    if (!interval || typeof interval !== "object") return null;
    const { open, close } = interval as Record<string, unknown>;
    if (
      typeof open !== "string" ||
      typeof close !== "string" ||
      !/^\d{2}:\d{2}$/.test(open) ||
      !/^\d{2}:\d{2}$/.test(close)
    ) {
      return null;
    }
    parsed.push({ open, close });
  }
  return parsed;
}

/**
 * Today's opening intervals from an outlet's `hours`, in WIB. Unknown shapes
 * render as no line rather than an invented one (fail closed, never wrong).
 */
export function todaysHours(
  hours: unknown,
  now: Date = new Date(),
): Array<{ open: string; close: string }> | null {
  return intervalsForDay(hours, now);
}

/** "07.00–19.00" from today's intervals (24 h, WIB conventions, dot separator). */
export function formatTodayHours(
  hours: unknown,
  now: Date = new Date(),
): string | null {
  const intervals = todaysHours(hours, now);
  if (intervals === null || intervals.length === 0) return null;
  const toDot = (hhmm: string) => hhmm.replace(":", ".");
  return intervals
    .map((iv) => `${toDot(iv.open)}–${toDot(iv.close)}`)
    .join(", ");
}
