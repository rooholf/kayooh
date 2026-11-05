/**
 * FR-CAT-01 — renter discovery E2E (visual smoke of the CURRENT state).
 *
 * Run with the API on :3001 (seeded) and `next start` on :3000:
 *   pnpm test:e2e        (from apps/web)
 *
 * Screenshots are written to ./e2e-artifacts/ .
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.join(__dirname, "..", "e2e-artifacts");

const VIEWPORTS = {
  mobile360x800: { width: 360, height: 800 },
  desktop1440x900: { width: 1440, height: 900 },
} as const;

async function shot(page: Page, name: string) {
  await mkdir(OUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: true });
}

test.beforeEach(async ({ page }) => {
  // NEG-4: the renter site never sends coordinates. Fail if it does.
  page.on("request", (req) => {
    const url = req.url();
    if (/[?&](lat|lng|latitude|longitude)=/.test(url)) {
      throw new Error(`NEG-4 violation: coordinate in request ${url}`);
    }
  });
});

for (const [profile, viewport] of Object.entries(VIEWPORTS)) {
  test(`renter home (FR-CAT-01) — ${profile}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sewa Sepeda" })).toBeVisible();
    // NEG-2: no individual bike ids/asset tags may appear anywhere in the UI.
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/assetTag|bikeId|asset_tag/i);
    await shot(page, `home-${profile}.png`);
  });

  test(`renter outlets list (FR-CAT-01) — ${profile}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/outlets");
    // The catalog loads client-side (TanStack Query); wait for content.
    await expect(page.getByRole("heading", { name: "Sewa Sepeda" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Jambi City Center/ }).first()).toBeVisible({ timeout: 10_000 });
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/assetTag|bikeId|asset_tag/i); // NEG-2
    await shot(page, `outlets-${profile}.png`);
  });
}

test("outlet detail link (current state: /outlets/:id is not implemented)", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile360x800);
  await page.goto("/outlets");
  await expect(page.getByRole("link", { name: /Jambi City Center/ }).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("link", { name: /Jambi City Center/ }).first().click();
  await page.waitForURL(/outlets\//, { timeout: 5_000 }).catch(() => undefined);
  await shot(page, "outlet-detail-attempt.png");
});
