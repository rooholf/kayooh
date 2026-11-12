import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:3001/api/v1";

test("offline round-trip: queue 3 checkouts, reconnect, applied in order", async ({ page, context, request }) => {
  const seedRes = await request.post(`${API_BASE}/dev/staff/seed-offline-roundtrip`);
  expect(seedRes.ok()).toBeTruthy();
  const seed = (await seedRes.json()) as {
    reservations: Array<{
      reservationId: string;
      voucherToken: string;
      bikeAssetTag: string;
      balanceAmountIdr: number;
      startsAt: string;
    }>;
  };
  const reservations = seed.reservations;

  await page.goto("/");
  await expect(page).toHaveTitle(/Pindai|Kayooh/i);
  await page.waitForTimeout(3000);

  // Remove authored sample rows entirely so only the 3 enqueued events remain.
  await page.evaluate(async () => {
    const req = indexedDB.open("kayooh-staff");
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    const db = req.result;
    const tx = db.transaction("scanEvents", "readwrite");
    const store = tx.objectStore("scanEvents");
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result as unknown[]);
      r.onerror = () => reject(r.error);
    });
    for (const row of rows) {
      const r = row as { synthetic?: boolean; id?: number };
      if (r.synthetic && r.id !== undefined) store.delete(r.id);
    }
    // Keep one non-synthetic applied row so seedSampleData does not reseed.
    store.add({
      clientEventId: crypto.randomUUID(),
      type: "checkout",
      occurredAt: new Date().toISOString(),
      payload: { bikeAssetTags: ["JMB-001-COM-001"] },
      status: "applied",
      attempts: 1,
      receivedAt: new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });

  await page.reload();
  await expect(page).toHaveTitle(/Pindai|Kayooh/i);
  await page.waitForTimeout(2000);

  await context.setOffline(true);

  const offsetsMin = [5, 9, 3];
  await page.evaluate(
    async ({ reservations, offsetsMin }) => {
      const dbName = "kayooh-staff";
      const req = indexedDB.open(dbName);
      await new Promise<void>((resolve, reject) => {
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      const db = req.result;
      const tx = db.transaction("scanEvents", "readwrite");
      const store = tx.objectStore("scanEvents");
      for (let i = 0; i < reservations.length; i += 1) {
        const r = reservations[i];
        const occurredAt = new Date(
          Date.parse(r.startsAt) + offsetsMin[i] * 60_000,
        ).toISOString();
        store.add({
          clientEventId: crypto.randomUUID(),
          type: "checkout",
          occurredAt,
          payload: {
            voucherToken: r.voucherToken,
            bikeAssetTags: [r.bikeAssetTag],
            checklist: {
              frame: "ok",
              brakes: "ok",
              tires: "ok",
              chain: "ok",
              saddle: "ok",
              handlebar_gears: "ok",
            },
            photoKeys: [`uploads/checklist/${crypto.randomUUID()}.jpg`],
            collateral: { type: "ktp", reference: "KTP-1234" },
            balanceCollection: { amountIdr: r.balanceAmountIdr, method: "cash" },
          },
          status: "pending",
          attempts: 0,
        });
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { reservations, offsetsMin },
  );

  await page.reload();
  await expect(page).toHaveTitle(/Pindai|Kayooh/i, { timeout: 15_000 });

  // Queue depth = 3 and the "Antrean" counter shows 3.
  const depth = await page.evaluate(async () => {
    const req = indexedDB.open("kayooh-staff");
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    const db = req.result;
    const tx = db.transaction("scanEvents", "readonly");
    const store = tx.objectStore("scanEvents");
    const idx = store.index("status");
    return await new Promise<number>((resolve, reject) => {
      const r = idx.count(IDBKeyRange.only("pending"));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  });
  expect(depth).toBe(3);
  await expect(page.getByRole("navigation")).toContainText("3", { timeout: 10_000 });
  await expect(page.getByText(/menunggu · luring/i).first()).toBeVisible({ timeout: 10_000 });

  // Reconnect and trigger sync.
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  // Poll until all 3 are applied.
  await expect
    .poll(
      async () => {
        return await page.evaluate(async () => {
          const req = indexedDB.open("kayooh-staff");
          await new Promise<void>((resolve, reject) => {
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          });
          const db = req.result;
          const tx = db.transaction("scanEvents", "readonly");
          const store = tx.objectStore("scanEvents");
          const idx = store.index("status");
          return await new Promise<number>((resolve, reject) => {
            const r = idx.count(IDBKeyRange.only("pending"));
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
        });
      },
      { timeout: 30_000 },
    )
    .toBe(0);

  // Verify the API recorded 3 rentals in chronological order.
  const ids = reservations.map((r) => r.reservationId).join(",");
  await page.waitForTimeout(1000);
  const verifyRes = await request.get(`${API_BASE}/dev/staff/rentals?ids=${ids}`);
  expect(verifyRes.ok()).toBeTruthy();
  const body = (await verifyRes.json()) as { rentals: Array<{ checkedOutAt: string }> };
  expect(body.rentals).toHaveLength(3);
  const checkedAt = body.rentals.map((r) => r.checkedOutAt);
  expect(checkedAt).toEqual([...checkedAt].sort());
});
