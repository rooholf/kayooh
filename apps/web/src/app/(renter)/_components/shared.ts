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
