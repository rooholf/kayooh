/**
 * FR-CAT-01 rev 1.3 — renter direct-entry E2E (link-in-bio pivot).
 *
 * Run with the API on :3001 (seeded) and `next start` on :3000:
 *   pnpm test:e2e        (from apps/web)
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expectNoBikeIds, guardNoCoordinates } from "./guards";

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
  guardNoCoordinates(page);
});

for (const [profile, viewport] of Object.entries(VIEWPORTS)) {
  test(`renter home (brand) — ${profile}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(
      page.getByText("SEPEDA SIAP ◆ DI OUTLET NYATA").first()
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /KAYOOH JAMBI/ })
    ).toBeVisible();

    // The brand sheet points at the demo outlet.
    await expect(
      page.getByRole("link", { name: /Buka poster outlet/ })
    ).toBeVisible();

    await expectNoBikeIds(page);

    await shot(page, `home-${profile}.png`);
  });

  test(`direct outlet landing /JMB-001 — ${profile}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/JMB-001");

    await expect(
      page.getByRole("heading", { name: /Telanaipura Hub/ })
    ).toBeVisible({ timeout: 10_000 });

    // Booking engine CTA is the conversion action.
    await expect(
      page.getByRole("link", { name: /Book Now!!/ })
    ).toBeVisible({ timeout: 10_000 });

    await expectNoBikeIds(page);

    await shot(page, `outlet-jmb001-${profile}.png`);
  });
}

test("direct outlet landing /JMB-002 renders its own poster", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile360x800);
  await page.goto("/JMB-002");
  await expect(page.getByRole("heading", { name: /Danau Sipin Recreation/ })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("link", { name: /Book Now!!/ })).toBeVisible();
  await expectNoBikeIds(page);
});

test("unknown outlet code shows the honest 404", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile360x800);
  const res = await page.goto("/JMB-999");
  expect(res?.status()).toBe(404);
  await expect(page.getByText(/Poster tidak ditemukan/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Poster KAYOOH/ })).toBeVisible();
});
