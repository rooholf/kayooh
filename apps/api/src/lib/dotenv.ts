/**
 * Load `apps/api/.env` at process boot (Node >= 21.7 `process.loadEnvFile`).
 *
 * MUST be imported BEFORE anything that pulls in `@repo/db` — the db package
 * creates its pg Pool at module load from `DATABASE_URL` (see vitest.config
 * note). ESM evaluation order guarantees this when it is the first import of
 * an entry point (`src/index.ts`, `src/worker.ts`).
 *
 * Semantics match node's --env-file: variables already present in the real
 * environment are NOT overridden, so `DATABASE_URL=... npx tsx src/index.ts`
 * keeps winning over the file. A missing file is not an error.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const envPath = join(import.meta.dirname, "..", "..", ".env");

if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(envPath);
  } catch (error) {
    // Malformed .env: fail loudly but only after the message is clear.
    console.error(`Failed to load ${envPath}:`, error);
    process.exit(1);
  }
}
