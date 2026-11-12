import { test, expect } from "@playwright/test";

/**
 * D.5 (issue #43) — staff PWA offline queue + capacity warning (NFR-07).
 *
 * The full "queue 3 events offline → reconnect → applied" scenario needs the
 * service worker + a live API + a staff session, which is exercised by the
 * API-side T-07/T-07-batch50 suites. Here we cover the client-side contract
 * that is testable in isolation: once 500 events are queued, the UI blocks
 * new scans with a visible "Antrean penuh" warning.
 */
test("staff app renders the shell", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Pindai|Kayooh/i);
});

test("capacity warning renders when 500 events are queued (mocked IndexedDB)", async ({ page }) => {
  await page.goto("/");

  // Seed the Dexie store with QUEUE_CAPACITY pending events directly, mirroring
  // what the PWA writes when offline. The schema mirrors apps/staff/src/db/scan-events.ts.
  await page.evaluate(async () => {
    const dbName = "kayooh-staff";
    // Open (or create) the same IndexedDB the staff app uses (see scan-events.ts).
    const req = indexedDB.open(dbName);
    await new Promise<void>((resolve, reject) => {
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("scanEvents")) {
          const store = db.createObjectStore("scanEvents", { keyPath: "id", autoIncrement: true });
          store.createIndex("clientEventId", "clientEventId", { unique: true });
          store.createIndex("status", "status");
          store.createIndex("occurredAt", "occurredAt");
          store.createIndex("type", "type");
        }
      };
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    const db = req.result;
    const tx = db.transaction("scanEvents", "readwrite");
    const store = tx.objectStore("scanEvents");
    for (let i = 0; i < 500; i += 1) {
      store.add({
        clientEventId: crypto.randomUUID(),
        type: "checkin",
        occurredAt: new Date().toISOString(),
        payload: { bikeAssetTag: "JMB-001-COM-000" },
        status: "pending",
        attempts: 0,
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });

  await page.reload();
  await expect(page.getByText(/Antrean penuh|Penuh 500\/500/i)).toBeVisible({ timeout: 10_000 });
});
