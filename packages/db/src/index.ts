import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
export type Database = typeof db;

/* Query-builder helpers re-exported so other packages import drizzle-orm
 * ONLY through this package (single drizzle instance per workspace — the
 * better-auth drizzle-adapter brings its own copy, which is fine at runtime
 * but MUST NOT feed apps/api typings). */
export {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  not,
  or,
  sql,
} from "drizzle-orm";
export type { SQL } from "drizzle-orm";

/** Pooled db or a transaction handle — the executor type for raw SQL units
 * (computeAvailability, quote) that run inside the reservation lock. */
export type TxOrDb = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export * from "./schema";
