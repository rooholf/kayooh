import "./src/lib/dotenv.js";
import { defineConfig } from "vitest/config";

/**
 * Integration tests run against a DEDICATED test database (`kayooh_test` on the
 * ephemeral pg@16 cluster) — never the dev database (`kayooh`) that a running
 * dev API / e2e run depends on (issue #32). `test/global-setup.ts` creates,
 * migrates and seeds that database once per run. Real env vars (e.g. an inline
 * `DATABASE_URL=... npx vitest run`) still override.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // 60 s cap per test: integration tests hit real Postgres.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Run test files serially: they share one database.
    fileParallelism: false,
    globalSetup: ["./test/global-setup.ts"],
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        (process.env.DATABASE_URL &&
        process.env.DATABASE_URL !== "postgresql://kayooh@127.0.0.1:5433/kayooh"
          ? process.env.DATABASE_URL
          : "postgresql://kayooh@127.0.0.1:5433/kayooh_test"),
    },
  },
});