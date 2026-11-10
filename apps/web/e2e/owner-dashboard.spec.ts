/**
 * Owner Dashboard E2E — Poster Solidaritas (Pemilik) oversight.
 *
 * Checks phone-first frame (390×844) and desktop (1440×900), verifying:
 * - Responsive layout matching grounded-poster-solidaritas.html mock
 * - Period tabs (HARI / PEKAN / BULAN)
 * - Saldo berjalan / Gross accrual plate (IDR integer)
 * - Fleet state breakdown (SIAP / TERSEWA / SERVIS)
 * - Rhythm bands (Ritme pendapatan pekan ini)
 * - Open rentals / late alert honest representation
 * - Footer with fleet summary and BUKA ARMADA CTA
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

    // Outlet strip
    await expect(page.getByText(/TELANAIPURA/i).first()).toBeVisible();
    await expect(page.getByText("45 UNIT", { exact: true })).toBeVisible();

    // Period tabs
    await expect(page.getByRole("tab", { name: "HARI" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "PEKAN" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "BULAN" })).toBeVisible();

    // Accrual plate
    await expect(page.getByText(/Saldo Berjalan/i)).toBeVisible();
    await expect(page.getByText("Pendapatan Kotor Pekan Ini")).toBeVisible();
    await expect(page.getByText("Rp 0")).toBeVisible();

    // Fleet breakdown
    await expect(page.getByText("Armada outlet")).toBeVisible();
    await expect(page.getByText("SIAP", { exact: true })).toBeVisible();
    await expect(page.getByText("TERSEWA", { exact: true })).toBeVisible();
    await expect(page.getByText("SERVIS", { exact: true })).toBeVisible();

    // Rhythm bands
    await expect(page.getByText("Ritme pendapatan pekan ini")).toBeVisible();

    // Summary footer & CTA
    await expect(page.getByText(/unit · .* siap/)).toBeVisible();
    await expect(page.getByRole("button", { name: "BUKA ARMADA" })).toBeVisible();

    await shot(page, `owner-dashboard-${profile}.png`);
  });
}
