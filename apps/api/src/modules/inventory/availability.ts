/**
 * computeAvailability (FR-INV-01). The capacity counting is RAW SQL by
 * directive (AGENTS Backend: "write raw SQL for the critical outlet_categories
 * reservation lock and capacity counting") — no ORM query builders here.
 *
 *   available = max(0, inService - buffer - committedReservations - committedRentals)
 *
 * Must run INSIDE the transaction that holds the FOR UPDATE lock on the
 * outlet_categories row (INV-2): decisions are made only from committed rows
 * visible to that transaction; nothing here may read caches (CONS).
 */
import { db as pooledDb, sql, type SQL, type TxOrDb } from "@repo/db";
import { getConfig } from "../app-config/index.js";

/** Either the pooled db or a transaction handle — both expose .execute(). */
export type QueryExecutor = TxOrDb;

export interface AvailabilityInput {
  outletId: string;
  category: string;
  startsAt: Date;
  endsAt: Date;
  excludeReservationId?: string;
}

interface CountResult {
  rows: Array<{ n: string | number } | undefined>;
}

async function countRows(exec: QueryExecutor, query: SQL): Promise<number> {
  const res = (await exec.execute(query)) as unknown as CountResult;
  const row = res.rows[0];
  return Number(row?.n ?? 0);
}

/** async count(*) helpers, one per FR-INV-01 term. */

export async function countInService(exec: QueryExecutor, input: AvailabilityInput): Promise<number> {
  const res = (await exec.execute(sql`
    SELECT count(*)::int AS n FROM bikes
    WHERE home_outlet_id = ${input.outletId}
      AND category = ${input.category}
      AND state NOT IN ('maintenance', 'unavailable')
  `)) as unknown as CountResult;
  return Number(res.rows[0]?.n ?? 0);
}

export async function countCommittedReservations(
  exec: QueryExecutor,
  input: AvailabilityInput,
  graceSeconds: number,
): Promise<number> {
  const excludeId = input.excludeReservationId ?? null;
  const res = (await exec.execute(sql`
    SELECT count(*)::int AS n FROM reservations
    WHERE outlet_id = ${input.outletId}
      AND category = ${input.category}
      -- half-open [starts_at, ends_at) overlap rule (SRS 3.1)
      AND starts_at < ${input.endsAt}
      AND ends_at > ${input.startsAt}
      AND (${excludeId}::uuid IS NULL OR id <> ${excludeId}::uuid)
      AND (
        (status = 'held' AND expires_at > now())
        OR (status = 'confirmed' AND at_risk = false
            AND starts_at + make_interval(secs => ${graceSeconds}) > now())
      )
  `)) as unknown as CountResult;
  return Number(res.rows[0]?.n ?? 0);
}

export async function countCommittedRentals(exec: QueryExecutor, input: AvailabilityInput): Promise<number> {
  const res = (await exec.execute(sql`
    SELECT count(*)::int AS n FROM rentals r
    JOIN bikes b ON b.id = r.bike_id
    WHERE r.status = 'open'
      AND b.home_outlet_id = ${input.outletId}
      AND b.category = ${input.category}
      -- An overdue open rental counts as running until staff check-in:
      -- a late bike is never double-booked.
      AND (r.expected_end_at > ${input.startsAt} OR r.expected_end_at <= now())
  `)) as unknown as CountResult;
  return Number(res.rows[0]?.n ?? 0);
}

export async function computeAvailability(
  exec: QueryExecutor,
  input: AvailabilityInput,
): Promise<number> {
  const graceMinutes = await getConfig("noshow.grace_minutes");

  // FR-INV-01.2: the buffer comes from the (locked) outlet_categories row.
  const bufRes = (await exec.execute(sql`
    SELECT safety_buffer FROM outlet_categories
    WHERE outlet_id = ${input.outletId} AND category = ${input.category}
  `)) as unknown as { rows: Array<{ safety_buffer: string | number } | undefined> };
  const bufRow = bufRes.rows[0];
  if (!bufRow) {
    // The caller (reservation lock) already verified the row exists and holds
    // FOR UPDATE on it, so this can only race a real anomaly.
    throw new Error(
      `outlet_categories row vanished mid-transaction: ${input.outletId}/${input.category}`,
    );
  }
  const buffer = Number(bufRow.safety_buffer);

  // NOTE: sequential awaits, never Promise.all — a transaction executor is a
  // single pg client and concurrent client.query() calls are deprecated/fragile.
  const inService = await countInService(exec, input);
  const committedReservations = await countCommittedReservations(exec, input, graceMinutes * 60);
  const committedRentals = await countCommittedRentals(exec, input);

  return Math.max(0, inService - buffer - committedReservations - committedRentals);
}
