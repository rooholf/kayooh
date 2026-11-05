/**
 * Shared staff-side integration helpers (FR-OFF-01 / FR-RNT-01 tests T-07 and
 * T-16). Reuses the shared integration harness (buildTestApp — Better Auth
 * session cookie, CapturingNotificationProvider, truncateAll).
 */
import { and, eq, sql } from "@repo/db";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import {
  bikeEvents,
  bikes,
  categories,
  db,
  deposits,
  outletCategories,
  outlets,
  owners,
  pricingRules,
  rentals,
  renters,
  reservations,
  users,
} from "@repo/db";
import { createReservationHold } from "../src/modules/inventory/index.js";
import { signVoucher } from "../src/lib/voucher.js";
import type { Principal } from "../src/modules/identity/guards.js";
import type { CreateReservationBody } from "@repo/contracts";
import { sessionCookie, type TestApp } from "./helpers.js";

/* ------------------------------------------------------------------ */
/* Offering + bikes                                                    */
/* ------------------------------------------------------------------ */

export interface Offering {
  ownerId: string;
  outletId: string;
  bikeTags: string[];
}

/**
 * Seeds an owner, outlet (24 h opening, buffer 0), category, pricing
 * (10_000/h) and N bikes of `category`.
 */
export async function seedOffering(
  bikeCount: number,
  category: "commuter" | "road" = "commuter",
): Promise<Offering> {
  const [owner] = await db.insert(owners).values({ name: "owner-staff-test" }).returning({ id: owners.id });
  const outletCode = `JMB-${Math.floor(Math.random() * 900 + 100)}`;
  const [outlet] = await db
    .insert(outlets)
    .values({
      ownerId: owner.id,
      code: outletCode,
      name: "Staff Test Outlet",
      address: "Jl. Staff Test No. 1, Jambi",
      lat: "-1.610000",
      lng: "103.613000",
      hours: {
        sun: [{ open: "00:00", close: "23:45" }],
        mon: [{ open: "00:00", close: "23:45" }],
        tue: [{ open: "00:00", close: "23:45" }],
        wed: [{ open: "00:00", close: "23:45" }],
        thu: [{ open: "00:00", close: "23:45" }],
        fri: [{ open: "00:00", close: "23:45" }],
        sat: [{ open: "00:00", close: "23:45" }],
      },
    })
    .returning({ id: outlets.id });
  await db
    .insert(categories)
    .values([{ code: "commuter", name: "Commuter" }, { code: "road", name: "Road" }])
    .onConflictDoNothing();
  await db.insert(outletCategories).values({
    outletId: outlet.id,
    ownerId: owner.id,
    category,
    safetyBuffer: 0,
    active: true,
  });
  const catCode = category === "commuter" ? "CMT" : "ROD";
  const outletNum = outletCode.replace("JMB-", "");
  const bikeTags: string[] = [];
  for (let i = 0; i < bikeCount; i += 1) {
    const tag = `JMB-${outletNum}-${catCode}-${String(i).padStart(3, "0")}`;
    await db.insert(bikes).values({
      ownerId: owner.id,
      assetTag: tag,
      category,
      homeOutletId: outlet.id,
      currentOutletId: outlet.id,
      state: "available",
    });
    bikeTags.push(tag);
  }
  await db.insert(pricingRules).values({
    outletId: outlet.id,
    category,
    rateIdr: 10_000n,
    effectiveFrom: new Date(Date.now() - 3_600_000),
  });
  return { ownerId: owner.id, outletId: outlet.id, bikeTags };
}

/* ------------------------------------------------------------------ */
/* Renters + staff accounts                                            */
/* ------------------------------------------------------------------ */

export interface SeededRenter {
  userId: string;
  renterId: string;
}

export async function seedRenter(opts?: {
  verificationStatus?: string;
  depositStatus?: string;
}): Promise<SeededRenter> {
  const email = `renter.${Date.now()}.${Math.floor(Math.random() * 1e6)}@renters.kayooh.test`;
  const phone = `+62812${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const [user] = await db
    .insert(users)
    .values({ email, emailVerified: false, name: "renter", role: "renter", phone })
    .returning({ id: users.id });
  const [renter] = await db
    .insert(renters)
    .values({
      userId: user.id,
      verificationStatus: opts?.verificationStatus ?? "verified",
      depositStatus: opts?.depositStatus ?? "held",
    })
    .returning({ id: renters.id });
  await db.insert(deposits).values({ renterId: renter.id, balanceIdr: 200_000n, status: "held" });
  return { userId: user.id, renterId: renter.id };
}

export interface SeededStaff {
  userId: string;
  email: string;
  password: string;
}

export async function seedStaff(
  email: string,
  password: string,
  outletId: string,
): Promise<SeededStaff> {
  const [staff] = await db
    .insert(users)
    .values({ email, emailVerified: true, name: "staff", role: "staff", outletId })
    .returning({ id: users.id });
  await db.execute(sql`
    INSERT INTO accounts (user_id, account_id, provider_id, password)
    VALUES (${staff.id}, ${staff.id}, 'credential', ${await hashPassword(password)})
  `);
  return { userId: staff.id, email, password };
}

export async function staffSessionCookie(app: TestApp, staff: SeededStaff): Promise<string> {
  const res = await app.app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: { email: staff.email, password: staff.password },
  });
  if (res.statusCode !== 200) {
    throw new Error(`staff sign-in failed (${res.statusCode}): ${res.body}`);
  }
  return sessionCookie(res.headers["set-cookie"]);
}

/* ------------------------------------------------------------------ */
/* Reservation fixtures (confirmed, priced)                            */
/* ------------------------------------------------------------------ */

/** Next day, 15 min slot aligned, whole seconds (V-TS output). */
export function nextWindow(hhmmOffsetMinutes = 24 * 60): { startsAt: string; endsAt: string } {
  const aligned = Math.ceil((Date.now() + hhmmOffsetMinutes * 60_000) / 900_000) * 900_000;
  const startsAt = new Date(aligned);
  const endsAt = new Date(aligned + 60 * 60_000);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

export function principalFor(userId: string): Principal {
  return {
    userId,
    role: "renter",
    ownerId: null,
    outletId: null,
    sessionId: "staff-test",
    sessionCreatedAt: new Date(),
  };
}

export interface ConfirmedReservation {
  reservationId: string;
  priceIdr: number;
  discountIdr: number;
  finalIdr: number;
  voucherToken: string;
  window: { startsAt: string; endsAt: string };
}

/**
 * Books through the FR-INV-02 service (so pricing/intents behave like
 * production), then "pays" it: `status = 'confirmed'` + `confirmed_at`.
 */
export async function seedConfirmedReservation(opts: {
  userId: string;
  outletId: string;
  category: "commuter" | "road";
  window: { startsAt: string; endsAt: string };
}): Promise<ConfirmedReservation> {
  const body: CreateReservationBody = {
    outletId: opts.outletId,
    category: opts.category,
    startsAt: opts.window.startsAt,
    endsAt: opts.window.endsAt,
  };
  const held = await createReservationHold(db, body, principalFor(opts.userId));
  await db.execute(sql`
    UPDATE reservations
    SET status = 'confirmed', confirmed_at = now()
    WHERE id = ${held.reservation.id}::uuid
  `);
  return {
    reservationId: held.reservation.id,
    priceIdr: held.reservation.priceIdr,
    discountIdr: held.reservation.discountIdr,
    finalIdr: held.reservation.finalIdr,
    voucherToken: signVoucher({ reservationId: held.reservation.id, expiresAt: new Date(Date.now() + 15 * 60_000) }),
    window: opts.window,
  };
}

/* ------------------------------------------------------------------ */
/* Reusable event fixture builders                                     */
/* ------------------------------------------------------------------ */

export const CHECKLIST = {
  frame: "ok",
  brakes: "ok",
  tires: "ok",
  chain: "ok",
  saddle: "ok",
  handlebar_gears: "ok",
} as const;

export function photoKeys(count = 2): string[] {
  return Array.from({ length: count }, () => `uploads/checklist/${randomUUID()}.jpg`);
}

/** A checkout event for the given reservation + bike (valid voucher by default). */
export function checkoutEvent(opts: {
  reservationId: string;
  voucherToken?: string;
  bikeAssetTag: string;
  occurredAt: string;
}): { clientEventId: string; occurredAt: string; type: "checkout"; payload: Record<string, unknown> } {
  // Vouchers are issued at scan time and expire 15 minutes later (SRS
  // FR-RNT-01: a visible-for-minutes QR). Signed relative to occurredAt so
  // future `occurredAt` values (offline events replayed later) stay valid.
  const occurredAtMs = new Date(opts.occurredAt).getTime();
  return {
    clientEventId: randomUUID(),
    occurredAt: opts.occurredAt,
    type: "checkout",
    payload: {
      voucherToken:
        opts.voucherToken ??
        signVoucher({ reservationId: opts.reservationId, expiresAt: new Date(occurredAtMs + 15 * 60_000) }),
      bikeAssetTag: opts.bikeAssetTag,
      checklist: { ...CHECKLIST },
      photoKeys: photoKeys(),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Shared state readers                                                */
/* ------------------------------------------------------------------ */

export { and, eq, sql, randomUUID, db, bikeEvents, rentals, reservations, bikes, owners, outlets, users, categories };
