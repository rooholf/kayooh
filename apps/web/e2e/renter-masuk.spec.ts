/**
 * #20 FR-ID-01 — renter phone-OTP sign-in E2E (`/masuk`).
 *
 * Covers:
 *   - the surface as a guest: two steps, the "lanjut tanpa akun" escape,
 *     and the honest wrong-code copy (401 OTP_INVALID);
 *   - the happy path: real OTP issued by the dev API (DEV_LOG_OTP) → verify →
 *     the `{ phone }` account plate from GET /renters/me, surviving a reload
 *     (session cookie on the web origin);
 *   - sign-in never gates: guest checkout and the honest /reservasi state
 *     stay reachable (revision 1.2);
 *   - NEG-2/NEG-4 guards on the new route.
 *
 * OTP reading: the dev API logs issued codes only with DEV_LOG_OTP=true.
 * Point E2E_API_LOG at that log (default /tmp/kayooh-api.log). Without it the
 * wrong-code test still runs (it submits known-wrong digits); the happy-path
 * test is skipped honestly.
 *
 * Assumes the API on :3001 (seeded) and `next start` on :3000.
 * Screenshots are written to ./e2e-artifacts/ .
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expectNoBikeIds, guardNoCoordinates } from "./guards";

const OUT_DIR = path.join(__dirname, "..", "e2e-artifacts");
const API_LOG = process.env.E2E_API_LOG ?? "/tmp/kayooh-api.log";

async function shot(page: Page, name: string) {
  await mkdir(OUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: true });
}

/** Newest issued OTP from the dev API's log, or null when unavailable/blind. */
async function lastOtp(): Promise<string | null> {
  try {
    const log = await readFile(API_LOG, "utf8");
    const lines = log.split("\n").filter((l) => l.includes("notification.log_provider"));
    const last = lines[lines.length - 1];
    if (!last) return null;
    const code = (JSON.parse(last).vars as { code?: string } | undefined)?.code;
    return /^\d{6}$/.test(code ?? "") ? (code as string) : null;
  } catch {
    return null;
  }
}

const MOBILE = { width: 360, height: 800 };

// The OTP tests share one dev-API log ("newest issued code") and one rate
// budget — parallel workers would race both. Serial keeps the reads honest.
test.describe.configure({ mode: "serial" });

/**
 * A fresh nominal phone per test: the API allows 5 sends per phone per hour,
 * so re-running the suite with a fixed number would 429 its own fourth run.
 * Random per run keeps the budget out of the way (V-PHONE accepts ≥10 digits).
 */
function nominalPhone(): string {
  return `08122${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}

/** The API's canonical form (+62E.164) — what the plate prints back. */
const canonicalPhone = (nominal: string): string => `+62${nominal.slice(1)}`;

/** Fill the phone, send the code, land on the OTP step. */
async function sendOtp(page: Page, phone: string) {
  await page
    .getByRole("textbox", { name: "Nomor HP (WhatsApp)" })
    .fill(phone);
  await page
    .getByRole("button", { name: /Kirim kode OTP/ })
    .click();
  await expect(page.locator(".medan--otp input")).toBeVisible();
}

test("masuk is reachable and guests stay unblocked", async ({ page }) => {
  guardNoCoordinates(page);
  await page.setViewportSize(MOBILE);
  await page.goto("/masuk");

  await expect(
    page.getByRole("heading", { name: /1 · Nomor HP/ })
  ).toBeVisible();
  // The escape is visible at the top of the page, before any form.
  await expect(
    page.getByRole("link", { name: /Lanjut tanpa akun/ })
  ).toBeVisible();

  // Sign-in never gates: guest surfaces stay open.
  await page.goto("/reservasi");
  await expect(page.getByText(/Belum masuk\./)).toBeVisible();
  await expectNoBikeIds(page);
});

test("entry links: home strip and the signed-out list header", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto("/");
  await page.getByRole("link", { name: /Masuk/ }).click();
  await expect(
    page.getByRole("heading", { name: /1 · Nomor HP/ })
  ).toBeVisible();

  await page.goto("/reservasi");
  await page.getByRole("link", { name: /Masuk/ }).first().click();
  await expect(
    page.getByRole("heading", { name: /1 · Nomor HP/ })
  ).toBeVisible();
});

test("wrong code shows the honest 401 copy and keeps the resend line", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto("/masuk");

  // Distinct fresh phone per test: the API's per-phone send budget stays out
  // of the other tests' way.
  const phone = nominalPhone();
  await sendOtp(page, phone);

  // Submit deliberately wrong digits (avoid the real code when the log is on).
  const real = await lastOtp();
  const wrong = real === "000000" ? "111111" : "000000";
  await page.locator(".medan--otp input").fill(wrong);
  await page.getByRole("button", { name: /Verifikasi/ }).click();

  await expect(page.getByText(/Kode tidak cocok\./)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Kirim kode baru/ })
  ).toBeVisible();
  await shot(page, "masuk-e2e-wrong-code.png");
});

test("happy path: OTP verify lands the account plate and survives a reload", async ({ page }) => {
  test.skip(
    (await lastOtp()) === null,
    "OTP log (E2E_API_LOG + DEV_LOG_OTP=true) unavailable — happy path needs the issued code",
  );
  await page.setViewportSize(MOBILE);
  await page.goto("/masuk");

  const phone = nominalPhone();
  await sendOtp(page, phone);
  const code = await lastOtp();
  expect(code).toMatch(/^\d{6}$/);
  await page.locator(".medan--otp input").fill(code as string);
  await page.getByRole("button", { name: /Verifikasi/ }).click();

  // The plate prints the verified phone back, then the boxed escape works.
  await expect(page.getByRole("heading", { name: /Akun aktif/ })).toBeVisible();
  await expect(page.getByText(canonicalPhone(phone))).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Yang terbuka lewat akun/ })
  ).toBeVisible();
  await shot(page, "masuk-e2e-plate.png");

  // Session cookie (HttpOnly, web origin) survives a reload: the plate shows
  // again without re-verifying.
  await page.reload();
  await expect(page.getByRole("heading", { name: /Akun aktif/ })).toBeVisible();

  await page.getByRole("link", { name: /Lihat reservasi kamu/ }).click();
  await expect(page).toHaveURL(/\/reservasi$/);
});
