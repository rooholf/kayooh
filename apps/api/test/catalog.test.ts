/**
 * FR-CAT-01 outlet discovery — integration tests against real Postgres (NFR-09).
 *
 * Covers: active-only outlets, zero-bike categories omitted, category filter
 * (AC: outlets without the category are not returned), lat/lng both-or-neither
 * (400), haversine distance sort, and NEG-2 (no bike ids in the response).
 */
import { describe, expect, it, afterAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  bikes,
  categories,
  db,
  outletCategories,
  outlets,
  owners,
} from "@repo/db";
import { buildTestApp, truncateAll, type TestApp } from "./helpers.js";

let t: TestApp;

// Fresh app per test; the shared pool stays open — only the LAST app is
// closed in afterAll (pool.end() would kill the shared module-level pool).
beforeEach(async () => {
  await truncateAll();
  t = await buildTestApp();
});

afterAll(async () => {
  await t.close();
});

interface SeedOutletInput {
  code: string;
  name: string;
  lat: string;
  lng: string;
  categories: string[];
  bikeCounts?: Record<string, number>;
  status?: "active" | "inactive";
}

async function seedOutlet(input: SeedOutletInput): Promise<string> {
  const [owner] = await db
    .insert(owners)
    .values({ name: `owner-${input.code}` })
    .returning({ id: owners.id });
  const [outlet] = await db
    .insert(outlets)
    .values({
      ownerId: owner.id,
      code: input.code,
      name: input.name,
      address: `Jl. ${input.code} No. 1, Jambi`,
      lat: input.lat,
      lng: input.lng,
      hours: {
        sun: [{ open: "00:00", close: "23:45" }],
        mon: [{ open: "00:00", close: "23:45" }],
        tue: [{ open: "00:00", close: "23:45" }],
        wed: [{ open: "00:00", close: "23:45" }],
        thu: [{ open: "00:00", close: "23:45" }],
        fri: [{ open: "00:00", close: "23:45" }],
        sat: [{ open: "00:00", close: "23:45" }],
      },
      ...(input.status ? { status: input.status } : {}),
    })
    .returning({ id: outlets.id });

  for (const category of input.categories) {
    await db
      .insert(categories)
      .values({ code: category, name: category })
      .onConflictDoNothing();
    await db.insert(outletCategories).values({
      outletId: outlet.id,
      ownerId: owner.id,
      category,
      safetyBuffer: 0,
      active: true,
    });
    const count = input.bikeCounts?.[category] ?? 0;
    if (count > 0) {
      await db.insert(bikes).values(
        Array.from({ length: count }, (_, i) => ({
          ownerId: owner.id,
          assetTag: `${input.code}-${category}-${i}-${randomUUID().slice(0, 8)}`,
          category,
          homeOutletId: outlet.id,
          currentOutletId: outlet.id,
          state: "available" as const,
        })),
      );
    }
  }
  return outlet.id;
}

describe("FR-CAT-01 GET /api/v1/outlets", () => {
  it("returns only active outlets with per-category counts and no bike ids", async () => {
    await seedOutlet({
      code: "JMB-001",
      name: "Outlets A",
      lat: "-1.610000",
      lng: "103.613000",
      categories: ["commuter"],
      bikeCounts: { commuter: 3 },
    });
    await seedOutlet({
      code: "JMB-002",
      name: "Outlets B",
      lat: "-1.620000",
      lng: "103.614000",
      categories: ["commuter"],
      bikeCounts: { commuter: 2 },
      status: "inactive",
    });

    const res = await t.app.inject({ method: "GET", url: "/api/v1/outlets" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.outlets).toHaveLength(1);
    const outlet = body.outlets[0];
    expect(outlet.code).toBe("JMB-001");
    expect(outlet.availability).toEqual({ commuter: 3 });
    expect(outlet.isOpenNow).toBe(true);
    expect(outlet.distanceKm).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/assetTag|bikeId|"bikes"/);
  });

  it("omits categories with zero bikes homed and filters by category (AC)", async () => {
    await seedOutlet({
      code: "JMB-001",
      name: "Outlets A",
      lat: "-1.610000",
      lng: "103.613000",
      categories: ["commuter", "road"],
      bikeCounts: { commuter: 2 }, // road offered but zero bikes homed
    });
    await seedOutlet({
      code: "JMB-003",
      name: "Outlets C",
      lat: "-1.630000",
      lng: "103.615000",
      categories: ["road"],
      bikeCounts: { road: 1 },
    });

    const all = await t.app.inject({ method: "GET", url: "/api/v1/outlets" });
    expect(all.statusCode).toBe(200);
    const allBody = all.json();
    const a = allBody.outlets.find((o: { code: string }) => o.code === "JMB-001");
    expect(a.availability).toEqual({ commuter: 2 }); // road omitted: zero bikes

    const road = await t.app.inject({
      method: "GET",
      url: "/api/v1/outlets?category=road",
    });
    expect(road.statusCode).toBe(200);
    const roadBody = road.json();
    expect(roadBody.outlets).toHaveLength(1);
    expect(roadBody.outlets[0].code).toBe("JMB-003");
  });

  it("sorts by distanceKm when lat/lng given and by name otherwise", async () => {
    await seedOutlet({
      code: "JMB-001",
      name: "Zeta",
      lat: "-1.700000",
      lng: "103.700000",
      categories: ["commuter"],
      bikeCounts: { commuter: 1 },
    });
    await seedOutlet({
      code: "JMB-003",
      name: "Alpha",
      lat: "-1.610000",
      lng: "103.613000",
      categories: ["commuter"],
      bikeCounts: { commuter: 1 },
    });

    const byName = await t.app.inject({ method: "GET", url: "/api/v1/outlets" });
    expect(byName.json().outlets.map((o: { name: string }) => o.name)).toEqual([
      "Alpha",
      "Zeta",
    ]);

    const byDistance = await t.app.inject({
      method: "GET",
      url: "/api/v1/outlets?lat=-1.61&lng=103.613",
    });
    const outletsByDistance = byDistance.json().outlets;
    expect(outletsByDistance[0].name).toBe("Alpha");
    expect(outletsByDistance[0].distanceKm).toBe(0);
    expect(outletsByDistance[1].name).toBe("Zeta");
    expect(outletsByDistance[1].distanceKm).toBeGreaterThan(0);
  });

  it("rejects lat without lng (400 VALIDATION_ERROR)", async () => {
    const res = await t.app.inject({
      method: "GET",
      url: "/api/v1/outlets?lat=-1.61",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()?.error?.code).toBe("VALIDATION_ERROR");
  });
});

describe("FR-CAT-01 rev 1.3 direct entry (GET /outlets/by-code/:code, GET /outlets/:id)", () => {
  it("resolves an outlet by code with per-category counts (same shape as the list)", async () => {
    const id = await seedOutlet({
      code: "JMB-900",
      name: "Bycode Rider",
      lat: "-1.61",
      lng: "103.613",
      categories: ["commuter", "fixie"],
      bikeCounts: { commuter: 3 },
    });

    const res = await t.app.inject({ method: "GET", url: "/api/v1/outlets/by-code/JMB-900" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.code).toBe("JMB-900");
    expect(body.id).toBe(id);
    expect(body.isOpenNow).toBe(true);
    // Zero-bike categories are omitted; a live figure for offered bikes.
    expect(body.availability).toEqual({ commuter: 3 });
    expect(body).not.toHaveProperty("bikeIds");
    expect(body).not.toHaveProperty("bikes");
  });

  it("404 NOT_FOUND for an unknown code", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/v1/outlets/by-code/JMB-999" });
    expect(res.statusCode).toBe(404);
    expect(res.json()?.error?.code).toBe("NOT_FOUND");
  });

  it("404 NOT_FOUND for an inactive outlet code, 400 for a malformed code", async () => {
    await seedOutlet({
      code: "JMB-901",
      name: "Closed Rider",
      lat: "-1.61",
      lng: "103.613",
      categories: ["commuter"],
      bikeCounts: { commuter: 1 },
      status: "inactive",
    });
    const inactive = await t.app.inject({
      method: "GET",
      url: "/api/v1/outlets/by-code/JMB-901",
    });
    expect(inactive.statusCode).toBe(404);
    expect(inactive.json()?.error?.code).toBe("NOT_FOUND");

    const malformed = await t.app.inject({
      method: "GET",
      url: "/api/v1/outlets/by-code/not-a-code",
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()?.error?.code).toBe("VALIDATION_ERROR");
  });

  it("resolves a single outlet by id; unknown id is 404", async () => {
    const id = await seedOutlet({
      code: "JMB-902",
      name: "Byid Rider",
      lat: "-1.61",
      lng: "103.613",
      categories: ["mtb"],
      bikeCounts: { mtb: 2 },
    });
    const ok = await t.app.inject({ method: "GET", url: `/api/v1/outlets/${id}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()?.name).toBe("Byid Rider");

    const missing = await t.app.inject({
      method: "GET",
      url: `/api/v1/outlets/${randomUUID()}`,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()?.error?.code).toBe("NOT_FOUND");
  });
});
