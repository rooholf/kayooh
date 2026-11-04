import { defineConfig } from "vitest/config";

/**
 * Integration tests run against the REAL Postgres instance (NFR-09 / QA
 * directives): DATABASE_URL must point at the ephemeral test cluster.
 * The env var is set here — before any test module is imported — because
 * @repo/db creates its pool at module load.
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
