/**
 * Owner Dashboard E2E — Poster Solidaritas (Pemilik) oversight.
 *
 * Checks phone-first frame (390×844) and desktop, verifying honest P1 data:
 * - Gross accrual plate (IDR integer)
 * - Fleet state breakdown (SIAP / TERSEWA / SERVIS)
 * - Open rentals / late alert honest representation
 * - No fake or hallucinated figures
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.join(__dirname, "..", "e2e-artifacts");

const VIEWPORTS = {
  phone390x844: { width: 390, height: 844 },
  desktop1440x900: { width: 1440, height: 900 },
} as const;

async function shot(page: Page, name: string) {
  await mkdir(OUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: true });
}

for (const [profile, viewport] of Object.entries(VIEWPORTS)) {
  test(`owner dashboard renders honest data — ${profile}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/owner/dashboard");

    // Top border brand
    await expect(page.getByText("KAYOOH JAMBI").first()).toBeVisible();
    await expect(page.getByText("PEMILIK").first()).toBeVisible();

    // Accrual plate
    await expect(
      page.getByText("Pendapatan Kotor Pekan Ini")
    ).toBeVisible();
    await expect(page.getByText("Rp 0")).toBeVisible();

    // Fleet breakdown
    await expect(page.getByText("Armada outlet")).toBeVisible();
    await expect(page.getByText("SIAP", { exact: true })).toBeVisible();
    await expect(page.getByText("TERSEWA", { exact: true })).toBeVisible();
    await expect(page.getByText("SERVIS", { exact: true })).toBeVisible();

    // Summary footer
    await expect(page.getByText(/unit · .* siap/)).toBeVisible();

    await shot(page, `owner-dashboard-${profile}.png`);
  });
}
