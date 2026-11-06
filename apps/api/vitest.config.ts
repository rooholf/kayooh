import "./src/lib/dotenv.js";
import { defineConfig } from "vitest/config";

/**
 * Integration tests run against the REAL Postgres instance (NFR-09 / QA
 * directives): DATABASE_URL must point at the ephemeral test cluster.
 * dotenv.js loads apps/api/.env here — before any test module is imported —
 * because @repo/db creates its pool at module load. Real env vars (e.g. an
 * inline `DATABASE_URL=... npx vitest run`) still override the file values.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // 60 s cap per test: integration tests hit real Postgres.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Run test files serially: they share one database.
    fileParallelism: false,
  },
});
