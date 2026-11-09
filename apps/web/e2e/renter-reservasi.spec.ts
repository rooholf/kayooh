/**
 * FR-INV-02 / FR-RNT-01 — the reservation path E2E ("Tiket Ambil").
 *
 * Covers the surfaces this issue builds and the safety invariants the SRS puts
 * on the renter app:
 *   - the checkout entry `/reservasi/baru` (reached from an outlet),
 *   - the reservations list `/reservasi` (honest signed-out state),
 *   - the claim ticket `/reservasi/[id]` (voucher surface, keyless state).
 *
 * Assumes the API is on :3001 (seeded) and `next start` on :3000, as the
 * discovery spec does. The full multi-bike happy path is T-13 (#10); this spec
 * guards the surface and the invariants (NEG-2/NEG-4/NEG-8).
 *
 * Screenshots are written to ./e2e-artifacts/ .
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expectNoBikeIds, guardNoCoordinates } from "./guards";

const OUT_DIR = path.join(__dirname, "..", "e2e-artifacts");

/** NEG-8: the renter app carries no cancel / end / relocate control. */
const FORBIDDEN_CONTROLS = /batal|cancel|akhiri|end sewa|selesaikan|relokasi|reallocate/i;

async function shot(page: Page, name: string) {
  await mkdir(OUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: true });
}

/** NEG-8: assert the surface exposes no control the renter must not have. */
async function expectNoSelfServeControls(page: Page) {
  await expect(page.getByRole("button", { name: FORBIDDEN_CONTROLS })).toHaveCount(0);
  await expect(page.getByRole("link", { name: FORBIDDEN_CONTROLS })).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  guardNoCoordinates(page);
});

test("outlet CTA opens the checkout at /reservasi/baru (step 1)", async ({
  page,
}) => {
  await page.goto("/JMB-001");
  await expect(
    page.getByRole("heading", { name: /Telanaipura Hub/ })
  ).toBeVisible({ timeout: 10_000 });

  // The sanctioned conversion action hands the funnel straight into checkout.
  await page.getByRole("link", { name: /Book Now!!/ }).click();
  await expect(page).toHaveURL(/\/reservasi\/baru\?outlet=[0-9a-f-]+&jenis=/, {
    timeout: 10_000,
  });

  // Step 1 renders: the stamp strip and the window/duration chooser.
  await expect(
    page.getByRole("list", { name: "Tahap reservasi" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /1 · Pilih jam & durasi/ })
  ).toBeVisible({ timeout: 10_000 });

  // Prefill: a slot is already chosen and the phone field is the only empty required input.
  await expect(page.locator(".aksi").first()).toBeVisible();

  await expectNoBikeIds(page);
  await expectNoSelfServeControls(page);

  await shot(page, "reservasi-baru.png");
});

test("/reservasi/baru without an outlet says so instead of guessing", async ({
  page,
}) => {
  await page.goto("/reservasi/baru");
  await expect(page.getByText(/Outlet tidak dikenali/)).toBeVisible({
    timeout: 10_000,
  });
  await expectNoBikeIds(page);
});

test("/reservasi list is honest when signed out", async ({ page }) => {
  await page.goto("/reservasi");

  // The list headline always renders; with no session the body says so rather
  // than inventing rows (A-18: guests have no list).
  await expect(
    page.getByRole("heading", { name: "Reservasi kamu" })
  ).toBeVisible();
  await expect(page.getByText(/Belum masuk/)).toBeVisible({ timeout: 10_000 });

  await expectNoBikeIds(page);
  await expectNoSelfServeControls(page);

  await shot(page, "reservasi-list.png");
});

test("/reservasi/[id] is keyless-honest and carries no bike ids", async ({
  page,
}) => {
  // A fresh context holds neither a session cookie nor a device guestToken, so
  // the detail route answers 401 -> the page says the ticket cannot be opened.
  await page.goto("/reservasi/11111111-1111-4111-8111-111111111111");

  await expect(
    page.getByRole("heading", { name: "Tiket tidak terbuka" })
  ).toBeVisible({ timeout: 10_000 });

  await expectNoBikeIds(page);
  await expectNoSelfServeControls(page);

  await shot(page, "reservasi-detail.png");
});
