/**
 * Shared renter-surface safety guards (SRS NEG-2 / NEG-4).
 *
 * Both renter specs inherit these so the two invariants are asserted on every
 * renter route instead of being re-implemented per test:
 *   NEG-4 — the renter client never sends coordinates.
 *   NEG-2 — no individual bike ids or asset tags ever render.
 */
import { expect, type Page } from "@playwright/test";

/** NEG-4: fail immediately if the renter client sends any coordinate. */
export function guardNoCoordinates(page: Page): void {
  page.on("request", (req) => {
    const url = req.url();
    if (/[?&](lat|lng|latitude|longitude)=/.test(url)) {
      throw new Error(`NEG-4 violation: coordinate in request ${url}`);
    }
  });
}

/** NEG-2: no individual bike ids or asset tags may appear in the rendered UI. */
export async function expectNoBikeIds(page: Page): Promise<void> {
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/assetTag|bikeId|asset_tag/i);
}
