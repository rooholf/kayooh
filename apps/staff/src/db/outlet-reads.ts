import Dexie, { type EntityTable } from "dexie";

/**
 * Offline cache of the staff outlet reads (SRS 7.2). Each successful
 * response is stored under its read key, so the overdue / expected / bikes
 * lists still render — timestamped — when the network drops. The cache is
 * advisory: a fresh fetch always wins, and the last good value is the
 * fallback while offline (FR-OFF-first).
 */
export interface OutletReadCacheRow {
  /** Read key, e.g. `overdue`, `expected:2026-11-12`, `bikes:maintenance`. */
  key: string;
  /** ISO instant the server answered. */
  fetchedAt: string;
  /** The raw response body. */
  body: string;
}

class OutletReadsDb extends Dexie {
  outletReads!: EntityTable<OutletReadCacheRow, "key">;

  constructor() {
    super("kayooh-staff-reads");
    this.version(1).stores({ outletReads: "key, fetchedAt" });
  }
}

export const outletReadsDb = new OutletReadsDb();

/** Store the last successful response body for a read key. */
export async function cacheOutletRead(key: string, body: string, fetchedAt = new Date().toISOString()): Promise<void> {
  await outletReadsDb.outletReads.put({ key, fetchedAt, body });
}

/** The cached row for a read key, or undefined when never fetched here. */
export async function getCachedOutletRead(key: string): Promise<OutletReadCacheRow | undefined> {
  return outletReadsDb.outletReads.get(key);
}
