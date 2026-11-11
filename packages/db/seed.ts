/**
 * Idempotent seed (NFR-10): the SRS §1.1 network (4 owners, 4 outlets, 150
 * bikes, 4 base categories, default pricing rules) plus JMB-005 "Jambi City
 * Center" — added for the e2e specs, which anchor on that outlet.
 *
 * Re-running is a no-op once the outlets (by code) already exist.
 */
import { db, eq } from "./src/index.js";
import {
  categories,
  owners,
  outlets,
  outletCategories,
  bikes,
  bikeEvents,
  pricingRules,
} from "./src/schema.js";

const NETWORK = [
  { code: "JMB-001", name: "Telanaipura Hub", owner: "CV Jambi Sepeda Maju", commuter: 20, road: 10, mtb: 10, fixie: 5, lat: -1.61, lng: 103.613 },
  { code: "JMB-002", name: "Danau Sipin Recreation", owner: "Sipin Lakeside Rentals", commuter: 15, road: 0, mtb: 10, fixie: 5, lat: -1.605, lng: 103.62 },
  { code: "JMB-003", name: "Kotabaru", owner: "Kotabaru Active", commuter: 10, road: 20, mtb: 5, fixie: 15, lat: -1.615, lng: 103.605 },
  { code: "JMB-004", name: "Pasar Jambi", owner: "Laju Express Rentals", commuter: 20, road: 0, mtb: 5, fixie: 0, lat: -1.608, lng: 103.618 },
  { code: "JMB-005", name: "Jambi City Center", owner: "City Center Cycles Jambi", commuter: 15, road: 10, mtb: 10, fixie: 10, lat: -1.6075, lng: 103.611 },
] as const;

const HOURS = {
  sun: [{ open: "07:00", close: "19:00" }],
  mon: [{ open: "07:00", close: "19:00" }],
  tue: [{ open: "07:00", close: "19:00" }],
  wed: [{ open: "07:00", close: "19:00" }],
  thu: [{ open: "07:00", close: "19:00" }],
  fri: [{ open: "07:00", close: "19:00" }],
  sat: [{ open: "07:00", close: "19:00" }],
};

const CAT_NAMES: Record<string, string> = {
  commuter: "Commuter",
  road: "Road",
  mtb: "Mountain",
  fixie: "Fixie",
};

const BIKE_PREFIX: Record<string, string> = {
  commuter: "COM",
  road: "ROD",
  mtb: "MTB",
  fixie: "FIX",
};

async function main() {
  // Categories.
  for (const code of ["commuter", "road", "mtb", "fixie"]) {
    await db
      .insert(categories)
      .values({ code, name: CAT_NAMES[code], attributesSchema: null })
      .onConflictDoNothing();
  }

  for (const net of NETWORK) {
    // Idempotency: skip if outlet code already exists.
    const existing = await db.select({ id: outlets.id }).from(outlets).where(eq(outlets.code, net.code)).limit(1);
    if (existing.length > 0) {
      console.log(`skip ${net.code} (already seeded)`);
      continue;
    }

    const [owner] = await db
      .insert(owners)
      .values({ name: net.owner, status: "active" })
      .returning({ id: owners.id });

    const [outlet] = await db
      .insert(outlets)
      .values({
        ownerId: owner.id,
        code: net.code,
        name: net.name,
        address: net.name + ", Jambi",
        lat: String(net.lat),
        lng: String(net.lng),
        hours: HOURS,
      })
      .returning({ id: outlets.id });

    const cats = (["commuter", "road", "mtb", "fixie"] as const).filter((c) => (net as Record<string, number>)[c] > 0);
    await db.insert(outletCategories).values(
      cats.map((c) => ({ outletId: outlet.id, category: c, ownerId: owner.id, safetyBuffer: 0 })),
    );

    // Bikes.
    const counts: Record<string, number> = { commuter: net.commuter, road: net.road, mtb: net.mtb, fixie: net.fixie };
    for (const cat of cats) {
      const prefix = BIKE_PREFIX[cat];
      const outletDigits = net.code.replace("JMB-", "");
      for (let i = 1; i <= counts[cat]; i++) {
        const tag = `JMB-${outletDigits}-${prefix}-${String(i).padStart(3, "0")}`;
        const [bike] = await db
          .insert(bikes)
          .values({
            assetTag: tag,
            category: cat,
            homeOutletId: outlet.id,
            currentOutletId: outlet.id,
            state: "available",
            ownerId: owner.id,
          })
          .returning({ id: bikes.id });
        await db.insert(bikeEvents).values({
          bikeId: bike.id,
          ownerId: owner.id,
          type: "registered",
          fromState: null,
          toState: "available",
          outletId: outlet.id,
          occurredAt: new Date(),
        });
      }
    }

    // Default pricing rules (weekday/weekend) per SRS seed.
    const rates: Record<string, { weekday: number; weekend: number }> = {
      commuter: { weekday: 10000, weekend: 15000 },
      road: { weekday: 20000, weekend: 30000 },
      mtb: { weekday: 15000, weekend: 20000 },
      fixie: { weekday: 10000, weekend: 15000 },
    };
    for (const cat of cats) {
      await db.insert(pricingRules).values({
        outletId: outlet.id,
        category: cat,
        dayType: "weekday",
        rateIdr: rates[cat].weekday,
        unitMinutes: 60,
        effectiveFrom: new Date("2020-01-01T00:00:00Z"),
      });
      await db.insert(pricingRules).values({
        outletId: outlet.id,
        category: cat,
        dayType: "weekend",
        rateIdr: rates[cat].weekend,
        unitMinutes: 60,
        effectiveFrom: new Date("2020-01-01T00:00:00Z"),
      });
    }

    console.log(`seeded ${net.code}: ${counts.commuter + counts.road + counts.mtb + counts.fixie} bikes`);
  }

  console.log("seed complete");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});