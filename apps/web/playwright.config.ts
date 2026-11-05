import { defineConfig, devices } from "@playwright/test";

/**
 * E2E for the renter site (FR-CAT-01).
 *
 * Assumes:
 *   - API running on :3001 with a seeded dev database
 *   - `next start` (production build) running on :3000
 *
 * Visual artifacts are written to ./e2e-artifacts/.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "./e2e-artifacts/test-results",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "off",
    screenshot: "off", // we take explicit, named screenshots in the spec
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
