import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "admin@kayooh.dev";
const ADMIN_PASSWORD = "Kayooh-admin-0001!";

test.describe("admin console: owner onboarding", () => {
  test("signs in and registers an owner that appears in the list", async ({ page }) => {
    await page.goto("/admin/masuk");
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /masuk/i }).click();

    // Lands on the admin dashboard.
    await expect(page).toHaveURL(/\/admin(\/)?$/, { timeout: 15_000 });

    await page.goto("/admin/owner");
    const ownerName = `E2E Owner ${Date.now()}`;
    await page.locator('input[placeholder="mis. CV Jambi Sepeda Maju"]').fill(ownerName);
    await page.locator('input[placeholder="BRI"]').fill("BCA");
    await page.locator('input[placeholder="1234567890"]').fill("1234567890");
    await page.locator('input[placeholder="sesi rekening bank"]').fill("E2E Rekening");
    await page.getByRole("button", { name: /daftarkan owner/i }).click();

    // The new owner id is surfaced and the owner appears in the list (now that GET /admin/owners exists, #64).
    await expect(page.getByText(/Owner terdaftar/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(ownerName)).toBeVisible({ timeout: 10_000 });
  });
});
