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
  test(`renter home (FR-CAT-01) — ${profile}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    // Poster present: slogan borders + masthead.
    await expect(
      page.getByText("SEPEDA SIAP ◆ DI OUTLET NYATA")
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /KAYOOH JAMBI/ })
    ).toBeVisible();

    // Jenis strip self-explaining: silhouette + name per type.
    await expect(
      page.getByRole("heading", { name: "Jenis sepeda" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /COMMUTER/ })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /ROAD/ })
    ).toBeVisible();

    // Specimen row shows the chosen type + live figure (not an invented number).
    await expect(page.getByRole("button", { name: /COMMUTER/ })).toHaveClass(
      /aria-pressed="true"/
    );

    await expectNoBikeIds(page);

    await shot(page, `home-${profile}.png`);
  });

  test(`renter outlets list (FR-CAT-01) — ${profile}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/outlets");

    // The catalog loads client-side (TanStack Query); wait for content.
    await expect(
      page.getByRole("heading", { name: /Ketersediaan Outlet/ })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("link", { name: /Jambi City Center/ }).first()
    ).toBeVisible({ timeout: 10_000 });

    await expectNoBikeIds(page);

    await shot(page, `outlets-${profile}.png`);
  });
}

test("outlet detail link opens /outlets/:id and shows specimen rows", async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.mobile360x800);
  await page.goto("/outlets");

  await expect(
    page.getByRole("link", { name: /Jambi City Center/ }).first()
  ).toBeVisible({ timeout: 10_000 });

  // /outlets/:id is now implemented — clicking an outlet navigates to its detail.
  await page.getByRole("link", { name: /Jambi City Center/ }).first().click();
  await expect(page).toHaveURL(/\/outlets\/[0-9a-f-]+$/, { timeout: 10_000 });

  // Detail shows outlet identity and four specimen rows (one per type).
  await expect(
    page.getByRole("heading", { name: /Jambi City Center/ })
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /COMMUTER/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /ROAD/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /MTB/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /FIXIE/ })).toBeVisible();

  // Selecting a type stamps ?jenis= in the URL.
  await page.getByRole("button", { name: /ROAD/ }).click();
  await expect(page).toHaveURL(/\/outlets\/[0-9a-f-]+\?jenis=road$/, {
    timeout: 10_000,
  });

  // NEG-2 still holds on the detail page.
  await expectNoBikeIds(page);

  await shot(page, "outlet-detail.png");
});
