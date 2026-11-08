/**
 * Load `apps/api/.env` at process boot (Node >= 21.7 `process.loadEnvFile`).
 *
 * MUST be imported BEFORE anything that pulls in `@repo/db` — the db package
 * creates its pg Pool at module load from `DATABASE_URL` (see vitest.config
 * note). ESM evaluation order guarantees this when it is the first import of
 * an entry point (`src/index.ts`, `src/worker.ts`).
 *
 * Semantics: variables already present in the real environment are NOT
 * overridden, so `DATABASE_URL=... npx tsx src/index.ts` keeps winning over
 * the file. A missing file is not an error. We parse the file ourselves
 * (instead of `process.loadEnvFile`) so that an already-set var — e.g. the
 * dedicated test database chosen by vitest — is never clobbered by a stale
 * value from `.env` (issue #32).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const envPath = join(import.meta.dirname, "..", "..", ".env");

if (existsSync(envPath)) {
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (key === "" || process.env[key] !== undefined) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch (error) {
    console.error(`Failed to load ${envPath}:`, error);
    process.exit(1);
  }
}