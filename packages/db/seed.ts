/**
 * Idempotent seed (NFR-10): the SRS §1.1 network (4 owners, 4 outlets, 150
 * bikes, 4 base categories, default pricing rules) plus JMB-005 "Jambi City
 * Center" — added for the e2e specs, which anchor on that outlet.
 *
 * Re-running is a no-op once the outlets (by code) already exist.
 *
 * C.4 (issue #42) adds, on the same canonical entry point, the §4 rows the
 * network seed (#9) does not own:
 *   - app_config: booking.max_active_reservations_per_phone (A-19) + the
 *     commission defaults (1800 bps, pre_discount) — inserted only when
 *     missing, so an admin PATCHed value is never clobbered.
 *   - users + Better Auth credential accounts: one owner user + one staff
 *     user per outlet, plus a single platform admin, so the admin console
 *     (#13) and staff PWA (#35) are testable. Idempotent by email.
 */
import { hashPassword } from "better-auth/crypto";
import { db, eq } from "./src/index.js";
import {
  accounts,
  appConfig,
  categories,
  owners,
  outlets,
  outletCategories,
  bikes,
  bikeEvents,
  pricingRules,
  users,
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

/* ------------------------------------------------------------------ */
/* C.4.1 + C.4.3 — §4 app_config rows                                  */
/* ------------------------------------------------------------------ */

/**
 * §4 values this seed owns explicitly (values mirror CONFIG_DEFAULTS in
 * apps/api/src/modules/app-config/index.ts). Inserted ONLY when the key is
 * missing — a value an admin changed via PATCH /admin/config must survive
 * a seed re-run (issue #42 AC: "re-run changes nothing beyond fixes").
 */
const CONFIG_SEED: Array<[string, unknown]> = [
  // A-19 anti-spam backstop for guest checkout (SRS §4: seed 3).
  ["booking.max_active_reservations_per_phone", 3],
  // Commission defaults (SRS §4 FIXED: 1800 bps on the pre-discount base;
  // read through getConfig by the P2 ledger leg, FR-LED-02).
  ["commission.default_rate_bps", 1800],
  ["commission.default_base", "pre_discount"],
];

async function seedConfig(): Promise<void> {
  for (const [key, value] of CONFIG_SEED) {
    await db
      .insert(appConfig)
      .values({ key, value })
      .onConflictDoNothing({ target: appConfig.key });
    console.log(`config: ensured ${key} = ${JSON.stringify(value)}`);
  }
}

/* ------------------------------------------------------------------ */
/* C.4.2 — owner/staff/admin users + Better Auth credential accounts  */
/* ------------------------------------------------------------------ */

const ADMIN_EMAIL = "admin@kayooh.dev";
const ADMIN_PASSWORD = "Kayooh-admin-0001!";

interface SeededUserSpec {
  email: string;
  name: string;
  password: string;
  role: "owner" | "staff" | "admin";
  ownerId?: string | null;
  outletId?: string | null;
}

/**
 * Creates a dev user + its Better Auth credential account, idempotent by
 * email. Same convention as POST /admin/users (identity/service.ts):
 * account_id = user id, provider_id = 'credential', emailVerified = true.
 */
async function seedSeededUser(spec: SeededUserSpec): Promise<"created" | "skipped"> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, spec.email))
    .limit(1);
  if (existing.length > 0) return "skipped";

  const [user] = await db
    .insert(users)
    .values({
      email: spec.email,
      name: spec.name,
      emailVerified: true, // admin-provisioned dev identity; email known-good
      role: spec.role,
      ownerId: spec.ownerId ?? null,
      outletId: spec.outletId ?? null,
    })
    .returning({ id: users.id });
  if (!user) throw new Error(`user insert returned no row: ${spec.email}`);

  await db
    .insert(accounts)
    .values({
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await hashPassword(spec.password),
    });
  return "created";
}

async function seedUsers(): Promise<void> {
  // One owner user + one staff user per seeded outlet. The issue AC says
  // "4 outlets/owners"; that predates the JMB-005 e2e outlet — seed covers
  // every outlet in NETWORK (5), keeping one canonical entry point.
  for (const net of NETWORK) {
    const outletRows = await db
      .select({ id: outlets.id, ownerId: outlets.ownerId })
      .from(outlets)
      .where(eq(outlets.code, net.code))
      .limit(1);
    if (outletRows.length === 0) continue; // outlet not present in this DB
    const { id: outletId, ownerId } = outletRows[0];

    const suffix = net.code.replace("JMB-", "");
    const owner = await seedSeededUser({
      email: `owner.jmb-${suffix}@kayooh.dev`,
      name: net.owner,
      password: `Kayooh-owner-${suffix}!`,
      role: "owner",
      ownerId,
    });
    const staff = await seedSeededUser({
      email: `staff.jmb-${suffix}@kayooh.dev`,
      name: `${net.name} staff`,
      password: `Kayooh-staff-${suffix}!`,
      role: "staff",
      outletId,
    });
    console.log(`users: ${net.code} owner ${owner}, staff ${staff}`);
  }

  const admin = await seedSeededUser({
    email: ADMIN_EMAIL,
    name: "Platform Admin",
    password: ADMIN_PASSWORD,
    role: "admin",
  });
  console.log(`users: admin ${admin} (${ADMIN_EMAIL})`);
}

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
        effectiveFrom: new Date("2020-01-01T00:00:00Z"),
      });
      await db.insert(pricingRules).values({
        outletId: outlet.id,
        category: cat,
        dayType: "weekend",
        rateIdr: rates[cat].weekend,
        effectiveFrom: new Date("2020-01-01T00:00:00Z"),
      });
    }

    console.log(`seeded ${net.code}: ${counts.commuter + counts.road + counts.mtb + counts.fixie} bikes`);
  }

  // C.4.1 + C.4.3 (§4 config the network seed doesn't own).
  await seedConfig();
  // C.4.2 (owner/staff/admin users + Better Auth credential accounts).
  await seedUsers();

  console.log("seed complete");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});