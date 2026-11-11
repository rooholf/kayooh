/**
 * listOutlets — FR-CAT-01 (outlet discovery for the renter catalog).
 *
 * Returns only `status = 'active'` outlets. Per outlet, every ACTIVE
 * `outlet_categories` row with at least one bike homed there contributes an
 * `availableNow` count (FR-INV-01 over the window
 * `[now, now + booking.min_duration_minutes)`). Categories with zero bikes
 * homed at the outlet are omitted.
 *
 * INV-2/AGENTS: the capacity counting itself stays raw SQL — it IS
 * `computeAvailability` from the inventory module (NEG-6: imported through
 * its index boundary), never a cached or client-supplied number.
 *
 * NEG-2: the response carries counts per category only — no bike ids or
 * asset tags. NEG-4: request lat/lng are used for the haversine sort only;
 * they are never persisted and never logged (pino redacts req.query.lat/lng).
 */
import { eq, sql } from "@repo/db";
import { db, outlets } from "@repo/db";
import type { GetOutletsQuery, OutletListItem, OutletListResponse } from "@repo/contracts";
import { outletListItemSchema } from "@repo/contracts";
import { computeAvailability } from "../inventory/index.js";
import { isOpenAt } from "../inventory/index.js";
import { getConfig } from "../app-config/index.js";

/** Great-circle distance in km, rounded to 1 decimal (FR-CAT-01.3). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}

interface OfferingRow {
  outlet_id: string;
  category: string;
}

/**
 * Resolve a single active outlet (FR-CAT-01 revision 1.3 direct entry) by
 * `code` or by `id`. Returns the same item shape as the list (counts per
 * category only — NEG-2); `null` when inactive or unknown.
 */
async function resolveOutletItem(
  where: { column: typeof outlets.code | typeof outlets.id; value: string },
  now: Date,
): Promise<OutletListItem | null> {
  const [outlet] = await db
    .select({
      id: outlets.id,
      code: outlets.code,
      name: outlets.name,
      description: outlets.description,
      address: outlets.address,
      lat: outlets.lat,
      lng: outlets.lng,
      hours: outlets.hours,
      status: outlets.status,
    })
    .from(outlets)
    .where(eq(where.column, where.value))
    .limit(1);
  if (!outlet || outlet.status !== "active") return null;

  // The same window the list uses: [now, now + booking.min_duration_minutes).
  const minDuration = await getConfig("booking.min_duration_minutes");
  const endsAt = new Date(now.getTime() + minDuration * 60_000);

  // Active offerings with at least one bike homed here (same rule as the list).
  const offeringRes = (await db.execute(sql`
    SELECT oc.outlet_id, oc.category
    FROM outlet_categories oc
    WHERE oc.outlet_id = ${outlet.id} AND oc.active = true
      AND EXISTS (
        SELECT 1 FROM bikes b
        WHERE b.home_outlet_id = oc.outlet_id AND b.category = oc.category
      )
  `)) as unknown as { rows: OfferingRow[] | undefined };

  const availability: Record<string, number> = {};
  for (const row of offeringRes.rows ?? []) {
    availability[row.category] = await computeAvailability(db, {
      outletId: outlet.id,
      category: row.category,
      startsAt: now,
      endsAt,
    });
  }

  return outletListItemSchema.parse({
    id: outlet.id,
    code: outlet.code,
    name: outlet.name,
    description: outlet.description,
    address: outlet.address,
    lat: Number(outlet.lat),
    lng: Number(outlet.lng),
    hours: outlet.hours,
    isOpenNow: isOpenAt(outlet.hours, now),
    availability,
  });
}

/** `GET /outlets/by-code/{code}` — the link-in-bio direct entry (FR-CAT-01 rev 1.3). */
export async function getOutletByCode(code: string): Promise<OutletListItem | null> {
  return resolveOutletItem({ column: outlets.code, value: code }, await serverNow());
}

/** `GET /outlets/{id}` — single outlet (SRS endpoint table). */
export async function getOutletById(id: string): Promise<OutletListItem | null> {
  return resolveOutletItem({ column: outlets.id, value: id }, await serverNow());
}

/** Database `now()` — the single time source for the availability window (SRS 3.1). */
export async function serverNow(): Promise<Date> {
  const nowRes = (await db.execute(sql`SELECT now() AS now_ts`)) as unknown as {
    rows: Array<{ now_ts: Date | string } | undefined>;
  };
  const nowRaw = nowRes.rows[0]?.now_ts;
  if (!nowRaw) throw new Error("Database clock unavailable.");
  return nowRaw instanceof Date ? nowRaw : new Date(nowRaw);
}

export async function listOutlets(query: GetOutletsQuery): Promise<OutletListResponse> {
  // Server time source is the database now() (SRS 3.1).
  const now = await serverNow();

  const minDuration = await getConfig("booking.min_duration_minutes");
  const endsAt = new Date(now.getTime() + minDuration * 60_000);

  const activeOutlets = await db
    .select({
      id: outlets.id,
      code: outlets.code,
      name: outlets.name,
      description: outlets.description,
      address: outlets.address,
      lat: outlets.lat,
      lng: outlets.lng,
      hours: outlets.hours,
    })
    .from(outlets)
    .where(eq(outlets.status, "active"));

  // Active offerings that have at least one bike homed at the outlet
  // (raw SQL: the "at least one bike" existence rule is FR-CAT-01.2).
  const offeringRes = (await db.execute(sql`
    SELECT oc.outlet_id, oc.category
    FROM outlet_categories oc
    WHERE oc.active = true
      AND EXISTS (
        SELECT 1 FROM bikes b
        WHERE b.home_outlet_id = oc.outlet_id AND b.category = oc.category
      )
  `)) as unknown as { rows: OfferingRow[] | undefined };
  const offerings = offeringRes.rows ?? [];

  const byOutlet = new Map<string, string[]>();
  for (const row of offerings) {
    const list = byOutlet.get(row.outlet_id) ?? [];
    list.push(row.category);
    byOutlet.set(row.outlet_id, list);
  }

  const items: OutletListItem[] = [];
  for (const outlet of activeOutlets) {
    const categories = byOutlet.get(outlet.id) ?? [];
    if (categories.length === 0) continue;
    if (query.category !== undefined && !categories.includes(query.category)) continue;

    const availability: Record<string, number> = {};
    for (const category of categories) {
      availability[category] = await computeAvailability(db, {
        outletId: outlet.id,
        category,
        startsAt: now,
        endsAt,
      });
    }

    const lat = Number(outlet.lat);
    const lng = Number(outlet.lng);
    const item: OutletListItem = {
      id: outlet.id,
      code: outlet.code,
      name: outlet.name,
      description: outlet.description,
      address: outlet.address,
      lat,
      lng,
      hours: outlet.hours,
      isOpenNow: isOpenAt(outlet.hours, now),
      availability,
    };
    if (query.lat !== undefined && query.lng !== undefined) {
      item.distanceKm = haversineKm(query.lat, query.lng, lat, lng);
    }
    items.push(item);
  }

  if (query.lat !== undefined && query.lng !== undefined) {
    items.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  } else {
    items.sort((a, b) => a.name.localeCompare(b.name));
  }

  return { outlets: items };
}
