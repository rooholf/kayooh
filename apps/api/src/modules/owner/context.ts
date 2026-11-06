import { sql, type TxOrDb } from "@repo/db";
import { db } from "@repo/db";

/**
 * FR-ID-03: every owner query runs inside a transaction that sets
 * `app.owner_id` (transaction-local via set_config(..., true)), so the RLS
 * policies on owners/outlets/outlet_categories/bikes/rentals etc. filter to
 * the caller's tenant. Repository helpers take ownerId as a compile-time
 * argument; there is no default.
 */
export async function withOwnerContext<T>(
  ownerId: string,
  fn: (tx: TxOrDb) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.owner_id', ${ownerId}, true)`);
    return fn(tx);
  });
}