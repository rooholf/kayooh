/**
 * T-08 (NEG-1, NEG-2, NEG-3) — no bike location columns anywhere; no
 * renter-facing bike-location or rental-end routes.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "@repo/db";
import { db } from "@repo/db";
import { buildTestApp, truncateAll, type TestApp } from "./helpers.js";

let t: TestApp;

beforeAll(async () => {
  t = await buildTestApp();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await t.close();
});

const FORBIDDEN_COLUMNS = ["lat", "lng", "latitude", "longitude", "gps"];

describe("T-08 (NEG-1/2/3): no bike location data or renter location/end routes", () => {
  it("bikes and bike_events have no location columns", async () => {
    const rows = await db.execute(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('bikes', 'bike_events')
        AND lower(column_name) IN ('lat', 'lng', 'latitude', 'longitude', 'gps')
    `);
    expect((rows.rows as Array<unknown>).length).toBe(0);
  });

  it("no registered route exposes bike location or rental-end for renters", () => {
    const routes = (t.app as unknown as { routes?: Array<{ method: string; url: string }> }).routes ?? [];
    const urls = routes.map((r) => r.url.toLowerCase());
    const bad = urls.filter(
      (u) =>
        u.includes("location") ||
        /rentals\/[^/]*\/end/.test(u) ||
        /bikes\/[^/]*\/location/.test(u),
    );
    expect(bad).toEqual([]);
  });
});
