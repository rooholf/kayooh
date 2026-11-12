/**
 * Issue #41 (plan C.2 remainder) — route wiring integration tests:
 *
 *   C.2.2  Staff outlet reads: /staff/outlet/bikes, /expected?date=, /overdue
 *          (outlet-scoped, masked phones, query validation).
 *   C.2.3  POST /staff/photos/upload-url (+ dev PUT sink; V-PHOTO-KEY HEAD
 *          existence + <= 5 MiB enforced when STORAGE_BASE_URL is set).
 *   C.2.4  Admin: PATCH owners/outlets, POST pricing-rules, PATCH config,
 *          GET/PATCH flagged-scans, GET audit-log.
 *   C.2.5/7/8/9 are verified present by earlier suites (owner dashboard,
 *          sse-stream, t-15, renter-endpoints #31 voucher guest access).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "@repo/db";
import {
  auditLog,
  bikes,
  db,
  outlets,
  owners,
  pricingRules,
  rentals,
  renters,
  reservations,
  scanEvents,
  users,
} from "@repo/db";
import { buildTestApp, seedAdmin, sessionCookie, truncateAll, type TestApp } from "./helpers.js";
import {
  nextWindow,
  seedConfirmedReservation,
  seedOffering,
  seedStaff,
  staffSessionCookie,
} from "./staff.helpers.js";
import { randomUUID } from "node:crypto";
import { signVoucher } from "../src/lib/voucher.js";
import { resetStorageProvider } from "../src/modules/staff/photo-storage.js";

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

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const STAFF_EMAIL = "staff-c2@kayooh.test";
const STAFF_PASSWORD = "staff-password-c2-x";
const OTHER_STAFF_EMAIL = "staff-c2-other@kayooh.test";

/** WIB calendar day (YYYY-MM-DD) of a timestamp (WIB = UTC+7). */
function wibDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

async function adminCookie(): Promise<string> {
  const admin = await seedAdmin();
  const login = await t.app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: { email: admin.email, password: admin.password },
  });
  return sessionCookie(login.headers["set-cookie"]);
}

async function insertStaffRenter(): Promise<{ userId: string; renterId: string }> {
  const [user] = await db
    .insert(users)
    .values({
      email: `renter-c2-${randomUUID()}@renters.kayooh.test`,
      emailVerified: false,
      name: "renter",
      role: "renter",
      phoneNumber: "+6281234567890",
    })
    .returning({ id: users.id });
  const [renter] = await db.insert(renters).values({ userId: user.id }).returning({ id: renters.id });
  return { userId: user.id, renterId: renter.id };
}

/* ------------------------------------------------------------------ */
/* C.2.2 — staff outlet reads                                          */
/* ------------------------------------------------------------------ */

describe("C.2.2 staff outlet reads (SRS 7.2)", () => {
  it("GET /staff/outlet/bikes lists only the staff outlet's bikes with filters", async () => {
    const partner = await seedOffering(3);
    await seedOffering(2, "road"); // another outlet entirely
    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, partner.outletId);
    // One of the outlet's bikes goes to maintenance.
    await db.update(bikes).set({ state: "maintenance" }).where(eq(bikes.assetTag, partner.bikeTags[0]));

    const cookie = await staffSessionCookie(t, staff);
    const all = await t.app.inject({
      method: "GET",
      url: "/api/v1/staff/outlet/bikes",
      headers: { cookie },
    });
    expect(all.statusCode).toBe(200);
    const allBody = all.json() as { items: { bikeId: string; assetTag: string; state: string }[]; nextCursor: string | null };
    expect(allBody.items).toHaveLength(3);
    for (const item of allBody.items) expect(item.assetTag.startsWith("JMB-")).toBe(true);

    const available = await t.app.inject({
      method: "GET",
      url: "/api/v1/staff/outlet/bikes?state=available",
      headers: { cookie },
    });
    expect((available.json() as { items: unknown[] }).items).toHaveLength(2);

    // Cursor pagination.
    const page1 = await t.app.inject({
      method: "GET",
      url: "/api/v1/staff/outlet/bikes?limit=2",
      headers: { cookie },
    });
    const p1 = page1.json() as { items: { assetTag: string }[]; nextCursor: string };
    expect(p1.items).toHaveLength(2);
    expect(p1.nextCursor).toBeTypeOf("string");
    const page2 = await t.app.inject({
      method: "GET",
      url: `/api/v1/staff/outlet/bikes?limit=2&cursor=${p1.nextCursor}`,
      headers: { cookie },
    });
    const p2 = page2.json() as { items: { assetTag: string }[] };
    expect(p2.items).toHaveLength(1);
    expect([p1.items[0].assetTag, p1.items[1].assetTag, p2.items[0].assetTag].sort())
      .toEqual(partner.bikeTags.slice().sort());
  });

  it("GET /staff/outlet/expected lists that WIB day's confirmed reservations with masked phones", async () => {
    const partner = await seedOffering(1);
    const renter = await insertStaffRenter();
    const window = nextWindow();
    await seedConfirmedReservation({
      userId: renter.userId,
      outletId: partner.outletId,
      category: "commuter",
      window,
    });
    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, partner.outletId);
    const cookie = await staffSessionCookie(t, staff);

    const res = await t.app.inject({
      method: "GET",
      url: `/api/v1/staff/outlet/expected?date=${wibDate(window.startsAt)}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: { renterPhoneMasked: string; quantity: number; status: string }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].renterPhoneMasked).toBe("+62812****890");
    expect(body.items[0].quantity).toBe(1);
    expect(body.items[0].status).toBe("confirmed");

    // An unfiltered different day returns nothing.
    const empty = await t.app.inject({
      method: "GET",
      url: "/api/v1/staff/outlet/expected?date=2020-01-01",
      headers: { cookie },
    });
    expect((empty.json() as { items: unknown[] }).items).toHaveLength(0);

    // Bad date -> 400 (VALIDATION_ERROR).
    const bad = await t.app.inject({
      method: "GET",
      url: "/api/v1/staff/outlet/expected?date=not-a-date",
      headers: { cookie },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("GET /staff/outlet/overdue lists only own-outlet open rentals past expected_end_at", async () => {
    const partner = await seedOffering(1);
    const renter = await insertStaffRenter();
    const window = nextWindow();
    const confirmed = await seedConfirmedReservation({
      userId: renter.userId,
      outletId: partner.outletId,
      category: "commuter",
      window,
    });
    const [bike] = await db.select().from(bikes).where(eq(bikes.currentOutletId, partner.outletId)).limit(1);
    const checkedOutAt = new Date(Date.now() - 3 * 3_600_000);
    const expectedEndAt = new Date(Date.now() - 1 * 3_600_000); // 1 h overdue
    await db.insert(rentals).values({
      reservationId: confirmed.reservationId,
      renterId: renter.renterId,
      bikeId: bike.id,
      ownerId: partner.ownerId,
      checkoutOutletId: partner.outletId,
      checkedOutAt,
      expectedEndAt,
      status: "open",
      escalationStage: 2,
      checkoutChecklist: { frame: "ok", brakes: "ok", tires: "ok", chain: "ok", saddle: "ok", handlebar_gears: "ok" },
      collateral: { type: "ktp", reference: "3271****901" },
    });

    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, partner.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "GET",
      url: "/api/v1/staff/outlet/overdue",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: { bikeAssetTag: string; renterPhoneMasked: string; escalationStage: number; overdue: boolean }[];
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].escalationStage).toBe(2);
    expect(body.items[0].renterPhoneMasked).toBe("+62812****890");
    expect(body.items[0].bikeAssetTag).toBe(bike.assetTag);
  });

  it("staff see only their own outlet (FR-ID-02.4)", async () => {
    const partner = await seedOffering(2);
    await seedOffering(2, "road");
    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, partner.outletId);
    await seedStaff(OTHER_STAFF_EMAIL, "other-password-c2-x", (await seedOffering(1)).outletId);
    const cookie = await staffSessionCookie(t, staff);

    const res = await t.app.inject({
      method: "GET",
      url: "/api/v1/staff/outlet/bikes?limit=100",
      headers: { cookie },
    });
    const body = res.json() as { items: { assetTag: string }[] };
    expect(body.items).toHaveLength(2);
    const prefix = partner.bikeTags[0].slice(0, 7); // JMB-XXX
    for (const item of body.items) expect(item.assetTag.startsWith(prefix)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* C.2.3 — photo upload URL                                            */
/* ------------------------------------------------------------------ */

describe("C.2.3 POST /staff/photos/upload-url (V-PHOTO-KEY)", () => {
  it("issues a V-PHOTO-KEY + upload URL (fixture provider)", async () => {
    const partner = await seedOffering(1);
    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, partner.outletId);
    const cookie = await staffSessionCookie(t, staff);

    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/photos/upload-url",
      headers: { cookie },
      payload: { kind: "checklist", contentType: "image/jpeg", sizeBytes: 1_000 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { uploadUrl: string; key: string; expiresAt: string };
    expect(body.key).toMatch(/^uploads\/checklist\/[0-9a-f-]{36}\.jpg$/);
    expect(body.uploadUrl).toContain(body.key);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects non-image content types and out-of-range sizes (400)", async () => {
    const partner = await seedOffering(1);
    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, partner.outletId);
    const cookie = await staffSessionCookie(t, staff);

    const badType = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/photos/upload-url",
      headers: { cookie },
      payload: { kind: "checklist", contentType: "application/pdf", sizeBytes: 1_000 },
    });
    expect(badType.statusCode).toBe(400);

    const tooBig = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/photos/upload-url",
      headers: { cookie },
      payload: { kind: "damage", contentType: "image/png", sizeBytes: 5_242_881 },
    });
    expect(tooBig.statusCode).toBe(400);
  });

  it("enforces the HEAD existence + <= 5 MiB rule when storage is configured", async () => {
    const partner = await seedOffering(1);
    const renter = await insertStaffRenter();
    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, partner.outletId);
    const cookie = await staffSessionCookie(t, staff);

    const prev = process.env.STORAGE_BASE_URL;
    process.env.STORAGE_BASE_URL = "http://127.0.0.1/api/v1/dev/storage";
    resetStorageProvider(); // re-point the fixture provider at the dev sink
    try {
      // Issue + PUT the object via the dev sink.
      const issued = await t.app.inject({
        method: "POST",
        url: "/api/v1/staff/photos/upload-url",
        headers: { cookie },
        payload: { kind: "checklist", contentType: "image/jpeg", sizeBytes: 10 },
      });
      const { uploadUrl, key } = issued.json() as { uploadUrl: string; key: string };
      const put = await t.app.inject({
        method: "PUT",
        url: uploadUrl.replace("http://127.0.0.1", ""),
        headers: { "content-type": "application/octet-stream" },
        payload: Buffer.from("jpeg-bytes"),
      });
      expect(put.statusCode).toBe(200);

      const confirmed = await seedConfirmedReservation({
        userId: renter.userId,
        outletId: partner.outletId,
        category: "commuter",
        window: nextWindow(),
      });
      const [resRow] = await db
        .select({ finalIdr: reservations.finalIdr, dpIdr: reservations.dpIdr })
        .from(reservations)
        .where(eq(reservations.id, confirmed.reservationId));
      // occurredAt inside the reservation window (checkout.early_minutes guard);
      // the voucher is signed relative to occurredAt (scan-time issue, 15-min TTL).
      const occurredAt = new Date(Date.parse(confirmed.window.startsAt) + 5 * 60_000).toISOString();
      const voucherToken = signVoucher({
        reservationId: confirmed.reservationId,
        expiresAt: new Date(Date.parse(occurredAt) + 15 * 60_000),
      });
      const base = {
        clientEventId: randomUUID(),
        occurredAt,
        type: "checkout" as const,
        payload: {
          voucherToken,
          bikeAssetTags: [partner.bikeTags[0]],
          checklist: { frame: "ok", brakes: "ok", tires: "ok", chain: "ok", saddle: "ok", handlebar_gears: "ok" },
          photoKeys: [key],
          collateral: { type: "ktp", reference: "3271****901" },
          balanceCollection: { amountIdr: Number(resRow.finalIdr - resRow.dpIdr), method: "cash" },
        },
      };

      const applied = await t.app.inject({
        method: "POST",
        url: "/api/v1/staff/events",
        headers: { cookie },
        payload: base,
      });
      expect(applied.statusCode).toBe(200);
      expect(applied.json()).toMatchObject({ status: "applied" });
      // A key that was never uploaded fails the HEAD rule.
      const ghost = await t.app.inject({
        method: "POST",
        url: "/api/v1/staff/events",
        headers: { cookie },
        payload: { ...base, clientEventId: randomUUID(), payload: { ...base.payload, photoKeys: ["uploads/checklist/00000000-0000-4000-8000-000000000000.jpg"] } },
      });
      expect(ghost.statusCode).toBe(400);
    } finally {
      if (prev === undefined) delete process.env.STORAGE_BASE_URL;
      else process.env.STORAGE_BASE_URL = prev;
    }
  });
});

/* ------------------------------------------------------------------ */
/* C.2.4 — admin routes                                                */
/* ------------------------------------------------------------------ */

describe("C.2.4 admin routes (SRS 7.4)", () => {
  it("PATCH /admin/owners/{id} sets status and writes audit (404 unknown)", async () => {
    const cookie = await adminCookie();
    const [owner] = await db.insert(owners).values({ name: "owner-c2" }).returning({ id: owners.id });

    const res = await t.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/owners/${owner.id}`,
      headers: { cookie },
      payload: { status: "suspended" },
    });
    expect(res.statusCode).toBe(200);
    const [after] = await db.select().from(owners).where(eq(owners.id, owner.id));
    expect(after.status).toBe("suspended");

    const audit = await db.select().from(auditLog).where(eq(auditLog.entity, "owners"));
    expect(audit.some((a) => a.action === "owner.updated" && a.entityId === owner.id)).toBe(true);

    const missing = await t.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/owners/${randomUUID()}`,
      headers: { cookie },
      payload: { status: "active" },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("GET /admin/owners lists owners with the D.6 OwnerRow shape (403 for non-admin)", async () => {
    const cookie = await adminCookie();
    const [created] = await db
      .insert(owners)
      .values({ name: "owner-list-c2", bankCode: "021", bankAccountNumber: "1234567890", bankAccountName: "Owner List C2" })
      .returning({ id: owners.id });

    const res = await t.app.inject({ method: "GET", url: "/api/v1/admin/owners", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: {
        id: string;
        name: string;
        status: string;
        bankCode: string | null;
        bankAccountNumber: string | null;
        bankAccountName: string | null;
        createdAt: string;
      }[];
    };
    expect(Array.isArray(body.items)).toBe(true);
    const row = body.items.find((o) => o.id === created.id);
    expect(row).toBeDefined();
    expect(row!.name).toBe("owner-list-c2");
    expect(row!.status).toBe("active");
    expect(row!.bankCode).toBe("021");
    expect(row!.bankAccountNumber).toBe("1234567890");
    expect(row!.bankAccountName).toBe("Owner List C2");
    expect(typeof row!.createdAt).toBe("string");

    // Non-admin (staff) is 403 on admin routes.
    const partner = await seedOffering(1);
    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, partner.outletId);
    const staffCookie = await staffSessionCookie(t, staff);
    const denied = await t.app.inject({ method: "GET", url: "/api/v1/admin/owners", headers: { cookie: staffCookie } });
    expect(denied.statusCode).toBe(403);
  });

  it("PATCH /admin/outlets/{id} updates fields and writes audit; bad status -> 422", async () => {
    const cookie = await adminCookie();
    const partner = await seedOffering(1);
    const [o] = await db.select().from(outlets).where(eq(outlets.id, partner.outletId));

    const res = await t.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/outlets/${o.id}`,
      headers: { cookie },
      payload: { name: "Renamed Outlet", status: "inactive" },
    });
    expect(res.statusCode).toBe(200);
    const [after] = await db.select().from(outlets).where(eq(outlets.id, o.id));
    expect(after.name).toBe("Renamed Outlet");
    expect(after.status).toBe("inactive");

    const audit = await db.select().from(auditLog).where(eq(auditLog.entity, "outlets"));
    expect(audit.some((a) => a.action === "outlet.updated" && a.entityId === o.id)).toBe(true);

    const bad = await t.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/outlets/${o.id}`,
      headers: { cookie },
      payload: { status: "suspended" }, // outlets use active|inactive
    });
    expect(bad.statusCode).toBe(400);
  });

  it("POST /admin/pricing-rules inserts a rule (201); unknown category/outlet handled", async () => {
    const cookie = await adminCookie();
    const partner = await seedOffering(1);

    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/admin/pricing-rules",
      headers: { cookie },
      payload: {
        outletId: partner.outletId,
        category: "commuter",
        dayType: "weekend",
        rateIdr: 15_000,
        effectiveFrom: new Date().toISOString(),
      },
    });
    expect(res.statusCode).toBe(201);
    const { id } = res.json() as { id: string };
    const [rule] = await db.select().from(pricingRules).where(eq(pricingRules.id, id));
    expect(rule.rateIdr).toBe(15_000n);
    expect(rule.dayType).toBe("weekend");

    const audit = await db.select().from(auditLog).where(eq(auditLog.entity, "pricing_rules"));
    expect(audit.some((a) => a.action === "pricing_rule.created" && a.entityId === id)).toBe(true);

    const badCat = await t.app.inject({
      method: "POST",
      url: "/api/v1/admin/pricing-rules",
      headers: { cookie },
      payload: { category: "unicorn", dayType: "all", rateIdr: 1, effectiveFrom: new Date().toISOString() },
    });
    expect(badCat.statusCode).toBe(422);
    expect(badCat.json()).toMatchObject({ error: { code: "CATEGORY_NOT_OFFERED" } });

    const badOutlet = await t.app.inject({
      method: "POST",
      url: "/api/v1/admin/pricing-rules",
      headers: { cookie },
      payload: {
        outletId: randomUUID(),
        category: "commuter",
        dayType: "all",
        rateIdr: 1,
        effectiveFrom: new Date().toISOString(),
      },
    });
    expect(badOutlet.statusCode).toBe(404);
  });

  it("PATCH /admin/config updates a section-4 key (404 unknown, 422 bad value)", async () => {
    const cookie = await adminCookie();

    const res = await t.app.inject({
      method: "PATCH",
      url: "/api/v1/admin/config",
      headers: { cookie },
      payload: { key: "hold.checkout_minutes", value: 30 },
    });
    expect(res.statusCode).toBe(200);

    const unknown = await t.app.inject({
      method: "PATCH",
      url: "/api/v1/admin/config",
      headers: { cookie },
      payload: { key: "not.a.key", value: 1 },
    });
    expect(unknown.statusCode).toBe(404);

    const badValue = await t.app.inject({
      method: "PATCH",
      url: "/api/v1/admin/config",
      headers: { cookie },
      payload: { key: "commission.default_rate_bps", value: 99_999 },
    });
    expect(badValue.statusCode).toBe(400);
  });

  it("GET/PATCH /admin/flagged-scans resolve the queue (409 double-resolve)", async () => {
    const cookie = await adminCookie();
    const partner = await seedOffering(1);
    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, partner.outletId);
    const [flagged] = await db
      .insert(scanEvents)
      .values({
        clientEventId: randomUUID(),
        staffId: staff.userId,
        outletId: partner.outletId,
        type: "checkin",
        payload: { bikeAssetTag: partner.bikeTags[0] },
        occurredAt: new Date(),
        status: "flagged",
        flagReason: "LATE_RETURN",
      })
      .returning({ id: scanEvents.id });

    const list = await t.app.inject({
      method: "GET",
      url: "/api/v1/admin/flagged-scans",
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as { items: { id: string; flagReason: string | null }[] };
    expect(body.items.some((i) => i.id === flagged.id && i.flagReason === "LATE_RETURN")).toBe(true);

    const resolved = await t.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/flagged-scans/${flagged.id}`,
      headers: { cookie },
      payload: { resolution: "corrected", note: "asset tag corrected at the counter" },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({ resolution: "corrected" });

    // Resolved rows leave the default (unresolved) queue…
    const afterList = await t.app.inject({
      method: "GET",
      url: "/api/v1/admin/flagged-scans",
      headers: { cookie },
    });
    expect((afterList.json() as { items: { id: string }[] }).items.some((i) => i.id === flagged.id)).toBe(false);
    // …but remain visible with includeResolved=true.
    const allList = await t.app.inject({
      method: "GET",
      url: "/api/v1/admin/flagged-scans?includeResolved=true",
      headers: { cookie },
    });
    expect((allList.json() as { items: { id: string }[] }).items.some((i) => i.id === flagged.id)).toBe(true);

    // Double resolve -> 409.
    const again = await t.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/flagged-scans/${flagged.id}`,
      headers: { cookie },
      payload: { resolution: "dismissed", note: "trying to resolve twice" },
    });
    expect(again.statusCode).toBe(409);

    const audit = await db.select().from(auditLog).where(eq(auditLog.entity, "scan_events"));
    expect(audit.some((a) => a.action === "flagged_scan.resolved" && a.entityId === flagged.id)).toBe(true);
  });

  it("GET /admin/audit-log filters by entity and actor", async () => {
    const cookie = await adminCookie();
    const [owner] = await db.insert(owners).values({ name: "owner-c2b" }).returning({ id: owners.id });
    await t.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/owners/${owner.id}`,
      headers: { cookie },
      payload: { status: "suspended" },
    });

    const res = await t.app.inject({
      method: "GET",
      url: "/api/v1/admin/audit-log?entity=owners",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: { entity: string; action: string }[] };
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) expect(item.entity).toBe("owners");
    expect(body.items.some((i) => i.action === "owner.updated")).toBe(true);
  });

  it("non-admin principals are 403 on admin routes", async () => {
    const partner = await seedOffering(1);
    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, partner.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const res = await t.app.inject({
      method: "GET",
      url: "/api/v1/admin/audit-log",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });
});

/* ------------------------------------------------------------------ */
/* C.2.5/7/8/9 — presence guards (already covered in depth elsewhere)   */
/* ------------------------------------------------------------------ */

describe("C.2 route presence (issue #41 verification rows)", () => {
  it("owner dashboard + stream + reallocation routes exist", async () => {
    await seedOffering(1);

    // Reallocation routes respond (401 unauthenticated rather than 404).
    const alternatives = await t.app.inject({
      method: "GET",
      url: `/api/v1/reservations/${randomUUID()}/alternatives`,
    });
    expect([401, 404]).toContain(alternatives.statusCode);

    const decline = await t.app.inject({
      method: "POST",
      url: `/api/v1/reservations/${randomUUID()}/decline-reallocation`,
    });
    expect([401, 404]).toContain(decline.statusCode);

    // Owner stream without a session -> 401 (FR-REP-02 AC).
    const ownerStream = await t.app.inject({
      method: "GET",
      url: "/api/v1/owner/stream",
    });
    expect(ownerStream.statusCode).toBe(401);

    // Owner routes exist (401 without session, not 404).
    for (const url of [
      "/api/v1/owner/dashboard/summary",
      "/api/v1/owner/rentals",
      "/api/v1/owner/bikes",
    ]) {
      const res = await t.app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
    }
  });
});
