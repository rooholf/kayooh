/**
 * Database handle for the API app (single pool per process — SRS 2).
 * The pool itself is owned by @repo/db (configured from DATABASE_URL);
 * this wrapper only exposes health/close without leaking the handle.
 */
import { pool } from "@repo/db";

export interface DbHandle {
  ready(): Promise<boolean>;
  close(): Promise<void>;
}

export function getDb(): DbHandle {
  return {
    ready: async () => {
      try {
        const r = await pool.query("SELECT 1 AS ok");
        return r.rows[0]?.ok === 1;
      } catch {
        return false;
      }
    },
    close: async () => {
      await pool.end().catch(() => undefined);
    },
  };
}
