import { eq, sql } from "@repo/db";
import { outlets } from "@repo/db";
import { withOwnerContext } from "./context.js";

export interface BikeStateCounts {
  [state: string]: number;
}

export interface CategorySummary {
  category: string;
  bikesByState: BikeStateCounts;
  heldCount: number;
  confirmedCount: number;
}

export interface OpenRentalRow {
  bikeAssetTag: string;
  renterPhoneMasked: string;
  checkedOutAt: string;
  expectedEndAt: string;
  overdue: boolean;
  escalationStage: number;
}

export interface OutletSummary {
  outletId: string;
  code: string;
  name: string;
  categories: CategorySummary[];
  openRentals: OpenRentalRow[];
  lateReturns: number;
}

export interface DashboardSummary {
  outlets: OutletSummary[];
  grossAccruedIdr: string;
}

function maskPhone(phone: string | null): string {
  if (!phone) return "";
  if (phone.length <= 8) return phone;
  return phone.slice(0, 6) + "****" + phone.slice(-3);
}

function wibWeekBounds(now: Date): { start: Date; end: Date } {
  const off = 7 * 60 * 60 * 1000;
  const wib = new Date(now.getTime() + off);
  const day = wib.getUTCDay(); // 0 Sun
  const mondayBack = day === 0 ? 6 : day - 1;
  const monday = new Date(wib);
  monday.setUTCDate(monday.getUTCDate() - mondayBack);
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 7);
  return { start: new Date(monday.getTime() - off), end: new Date(sunday.getTime() - off) };
}

export async function getDashboardSummary(ownerId: string): Promise<DashboardSummary> {
  return withOwnerContext(ownerId, async (tx) => {
    const outletRows = await tx
      .select({ id: outlets.id, code: outlets.code, name: outlets.name })
      .from(outlets)
      .where(eq(outlets.ownerId, ownerId));

    const now = new Date();
    const { start: weekStart, end: weekEnd } = wibWeekBounds(now);

    const outletsSummary: OutletSummary[] = [];
    for (const o of outletRows) {
      // bikes by state per category
      const bikeRows = (await tx.execute(sql`
        SELECT category, state, count(*)::int AS n
        FROM bikes
        WHERE home_outlet_id = ${o.id}::uuid
        GROUP BY category, state
      `)) as unknown as { rows: Array<{ category: string; state: string; n: number | string }> };

      const bikesByCatState = new Map<string, Map<string, number>>();
      const catSet = new Set<string>();
      for (const r of bikeRows.rows) {
        if (!r) continue;
        catSet.add(r.category);
        if (!bikesByCatState.has(r.category)) bikesByCatState.set(r.category, new Map());
        bikesByCatState.get(r.category)!.set(r.state, Number(r.n));
      }

      // held/confirmed counts per category (overlapping now)
      const resRows = (await tx.execute(sql`
        SELECT category, status, COALESCE(SUM(quantity),0)::int AS q
        FROM reservations
        WHERE outlet_id = ${o.id}::uuid
          AND status IN ('held','confirmed')
          AND starts_at <= ${now}::timestamptz
          AND ends_at > ${now}::timestamptz
        GROUP BY category, status
      `)) as unknown as { rows: Array<{ category: string; status: string; q: number | string }> };

      const heldByCat = new Map<string, number>();
      const confirmedByCat = new Map<string, number>();
      for (const r of resRows.rows) {
        if (!r) continue;
        catSet.add(r.category);
        if (r.status === "held") heldByCat.set(r.category, Number(r.q));
        if (r.status === "confirmed") confirmedByCat.set(r.category, Number(r.q));
      }

      const categories: CategorySummary[] = [...catSet].sort().map((c) => ({
        category: c,
        bikesByState: Object.fromEntries(bikesByCatState.get(c) ?? new Map()),
        heldCount: heldByCat.get(c) ?? 0,
        confirmedCount: confirmedByCat.get(c) ?? 0,
      }));

      // open rentals
      const openRentalRows = (await tx.execute(sql`
        SELECT b.asset_tag, u.phone, r.checked_out_at, r.expected_end_at, r.escalation_stage
        FROM rentals r
        JOIN bikes b ON b.id = r.bike_id
        JOIN renters ren ON ren.id = r.renter_id
        JOIN users u ON u.id = ren.user_id
        WHERE r.status = 'open'
          AND b.home_outlet_id = ${o.id}::uuid
        ORDER BY r.checked_out_at DESC
      `)) as unknown as {
        rows: Array<{
          asset_tag: string;
          phone: string | null;
          checked_out_at: string;
          expected_end_at: string;
          escalation_stage: number;
        }>;
      };

      const openRentals: OpenRentalRow[] = openRentalRows.rows.map((r) => ({
        bikeAssetTag: r.asset_tag,
        renterPhoneMasked: maskPhone(r.phone),
        checkedOutAt: r.checked_out_at,
        expectedEndAt: r.expected_end_at,
        overdue: new Date(r.expected_end_at).getTime() < now.getTime(),
        escalationStage: Number(r.escalation_stage ?? 0),
      }));

      const lateReturns = openRentals.filter((r) => r.overdue).length;

      outletsSummary.push({
        outletId: o.id,
        code: o.code,
        name: o.name,
        categories,
        openRentals,
        lateReturns,
      });
    }

    // gross accrued this WIB week: sum price_idr of completed rentals
    const grossRows = (await tx.execute(sql`
      SELECT COALESCE(SUM(res.price_idr), 0)::text AS total
      FROM rentals r
      JOIN reservations res ON res.id = r.reservation_id
      JOIN bikes b ON b.id = r.bike_id
      JOIN outlets o ON o.id = b.home_outlet_id
      WHERE o.owner_id = ${ownerId}::uuid
        AND r.status = 'completed'
        AND r.checked_in_at >= ${weekStart}::timestamptz
        AND r.checked_in_at < ${weekEnd}::timestamptz
    `)) as unknown as { rows: Array<{ total: string }> };

    const grossAccruedIdr = grossRows.rows[0]?.total ?? "0";

    return { outlets: outletsSummary, grossAccruedIdr };
  });
}