import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "./e2e-artifacts/test-results",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3002",
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://localhost:3002",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_STAFF_TOKEN: "dev-staff-token",
      VITE_TAG_HMAC_SECRET: "dev-insecure-tag-hmac-secret",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});