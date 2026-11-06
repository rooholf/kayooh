/**
 * Config store tests (SRS section 4): 30 s cache, defaults seeded on first
 * read, admin mutation audit logged (FR-SEC-02).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { eq } from "@repo/db";
import { appConfig, auditLog, db } from "@repo/db";
import { invalidateConfigCache, getConfig, setConfig } from "../src/modules/app-config/index.js";
import { seedAdmin, truncateAll } from "./helpers.js";

let adminId: string;

beforeEach(async () => {
  await truncateAll();
  invalidateConfigCache();
  adminId = (await seedAdmin()).userId;
});

describe("app_config store (SRS section 4)", () => {
  it("seeds the SRS default on first read and persists it", async () => {
    const value = await getConfig("hold.checkout_minutes");
    expect(value).toBe(15); // SRS section 4 default
    const rows = await db
      .select()
      .from(appConfig)
      .where(eq(appConfig.key, "hold.checkout_minutes"));
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(15);
  });

  it("returns the stored value after an admin change (cache invalidated)", async () => {
    await getConfig("commission.default_rate_bps"); // seeds 1800
    await setConfig({
      key: "commission.default_rate_bps",
      value: 2000,
      actorId: adminId,
    });
    const value = await getConfig("commission.default_rate_bps");
    expect(value).toBe(2000);
  });

  it("writes an audit row for every change (FR-SEC-02)", async () => {
    const before = await getConfig("booking.max_quantity"); // 5
    await setConfig({ key: "booking.max_quantity", value: 8, actorId: adminId, before });
    const audits = await db.select().from(auditLog);
    const entry = audits.find((a) => a.action === "config.change");
    expect(entry).toBeDefined();
    expect(entry.actorId).toBe(adminId);
    expect(entry.before).toEqual({ key: "booking.max_quantity", value: before });
    expect(entry.after).toEqual({ key: "booking.max_quantity", value: 8 });
  });

  it("rejects unknown keys and schema-violating values", async () => {
    await expect(
      setConfig({ key: "not.a.key", value: 1, actorId: adminId }),
    ).rejects.toThrow(/Unknown config key/);
    await expect(
      setConfig({ key: "commission.default_rate_bps", value: 99999, actorId: adminId }),
    ).rejects.toThrow(); // bps must be <= 10000
  });

  it("serves reads from the 30 s cache without re-querying", async () => {
    await getConfig("booking.slot_minutes"); // seeds 15
    // Mutate the row behind the cache's back; cached read must not see it.
    await db
      .update(appConfig)
      .set({ value: 99 })
      .where(eq(appConfig.key, "booking.slot_minutes"));
    const value = await getConfig("booking.slot_minutes");
    expect(value).toBe(15); // cached
    invalidateConfigCache();
    const fresh = await getConfig("booking.slot_minutes");
    expect(fresh).toBe(99);
  });
});
