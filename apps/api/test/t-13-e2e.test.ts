/**
 * T-13 (SRS §10) — end-to-end multi-bike rental spine against the REAL
 * Postgres cluster (NFR-09) and the public HTTP surface:
 *
 *   guest books quantity = 2 (contactPhone, Idempotency-Key) -> 50% DP intent
 *   -> FakeGateway PAID webhook confirms -> staff checkout (2 bikeAssetTags +
 *   collateral + offline balanceCollection) -> one check-in per bike ->
 *   inspection `pass` on both rentals.
 *
 * Expected: 2 `rentals` `completed` under one reservation, both bikes back to
 * `available`, and the reservation `fulfilled`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, eq } from "@repo/db";
import { bikes, paymentIntents, rentals, reservations } from "@repo/db";
import { buildTestApp, truncateAll, type TestApp } from "./helpers.js";
import {
  checkoutEvent,
  nextWindow,
  seedOffering,
  seedStaff,
  staffSessionCookie,
  type Offering,
} from "./staff.helpers.js";

const WEBHOOK_URL = "/webhooks/fake";
const WEBHOOK_HEADERS = { "x-callback-token": "dev-fake-webhook-secret" };
const GUEST_PHONE = "+6281234567890";

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

function guestBookingBody(offering: Offering, quantity: number, window: { startsAt: string; endsAt: string }) {
  return {
    outletId: offering.outletId,
    category: "commuter",
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    quantity,
    contactPhone: GUEST_PHONE,
  };
}

/** Books a guest reservation over the public route and pays the DP via FakeGateway. */
async function confirmedGuestBooking(quantity: number) {
  const offering = await seedOffering(quantity + 1); // one spare beyond what is booked
  const window = nextWindow();

  const booked = await t.app.inject({
    method: "POST",
    url: "/api/v1/reservations",
    headers: { "Idempotency-Key": randomUUID() },
    payload: guestBookingBody(offering, quantity, window),
  });
  expect(booked.statusCode).toBe(201);
  const body = booked.json() as {
    reservation: { id: string; status: string; quantity: number };
    price: { priceIdr: number; finalIdr: number; dpIdr: number };
    paymentUrl?: string;
    guestToken?: string;
  };
  expect(body.reservation.status).toBe("held");
  expect(body.reservation.quantity).toBe(quantity);
  // FR-PRC-01 quote() scales price by quantity (FR-INV-02.4), and
  // FR-INV-02 step 5 copies the price fields from the quote — so a
  // quantity=2 reservation is priced at 2× the 1-hour weekday rate
  // (20_000), with the DP at 50% (10_000, INV-5).
  expect(body.price.finalIdr).toBe(20_000);
  expect(body.price.priceIdr).toBe(body.price.finalIdr);
  expect(body.price.dpIdr).toBe(10_000);
  expect(body.paymentUrl).toEqual(expect.stringContaining("pay.fixtures.jambi.test"));
  expect(body.guestToken).toEqual(expect.any(String));

  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.reservationId, body.reservation.id))
    .limit(1);
  expect(intent?.status).toBe("pending");
  expect(intent?.amountIdr).toBe(BigInt(body.price.dpIdr));

  const webhook = await t.app.inject({
    method: "POST",
    url: WEBHOOK_URL,
    headers: WEBHOOK_HEADERS,
    payload: {
      event_id: `evt-t13-${body.reservation.id}`,
      external_id: intent?.id ?? "",
      status: "PAID",
      paid_amount: Number(intent?.amountIdr ?? 0),
    },
  });
  expect(webhook.statusCode).toBe(200);
  expect(webhook.json()).toMatchObject({ status: "processed" });

  const [res] = await db.select().from(reservations).where(eq(reservations.id, body.reservation.id));
  expect(res.status).toBe("confirmed");

  return { offering, reservationId: body.reservation.id, finalIdr: body.price.finalIdr, dpIdr: body.price.dpIdr, window };
}

describe("T-13: end-to-end multi-bike rental (book -> DP -> checkout -> return)", () => {
  it("books quantity=2, confirms the DP, checks out both bikes with collateral, and completes both rentals", async () => {
    const booking = await confirmedGuestBooking(2);
    const { offering } = booking;

    // --- Staff checkout: voucher scan + BOTH asset tags + collateral + balance
    const staff = await seedStaff("staff-t13@kayooh.test", "staff-password-t13", offering.outletId);
    const cookie = await staffSessionCookie(t, staff);
    const tags = offering.bikeTags.slice(0, 2);

    const checkout = await checkoutEvent({
      reservationId: booking.reservationId,
      bikeAssetTags: tags,
      occurredAt: booking.window.startsAt,
      collateral: { type: "ktp", reference: "KTP-••••5678" },
      balanceCollection: { amountIdr: booking.finalIdr - booking.dpIdr, method: "cash" },
    });
    const checkoutRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/staff/events",
      headers: { cookie },
      payload: checkout,
    });
    expect(checkoutRes.statusCode, `checkout ${checkoutRes.body}`).toBe(200);
    expect(checkoutRes.json()).toMatchObject({ status: "applied" });

    const [resAfterCheckout] = await db.select().from(reservations).where(eq(reservations.id, booking.reservationId));
    expect(resAfterCheckout.status).toBe("fulfilled");

    const openRentals = await db.select().from(rentals).where(eq(rentals.reservationId, booking.reservationId));
    expect(openRentals).toHaveLength(2);
    for (const rental of openRentals) {
      expect(rental.status).toBe("open");
      expect(rental.balanceCollectedIdr).toBe(BigInt(booking.finalIdr - booking.dpIdr));
      expect(rental.balanceMethod).toBe("cash");
      expect(rental.collateral).toMatchObject({ type: "ktp" });
    }

    const heldBikes = await db.select().from(bikes).where(eq(bikes.category, "commuter"));
    const checkedOut = heldBikes.filter((b) => tags.includes(b.assetTag));
    expect(checkedOut).toHaveLength(2);
    expect(checkedOut.every((b) => b.state === "in_rental")).toBe(true);

    // --- One check-in per bike (FR-RNT-02): in_rental -> pending_inspection
    for (const tag of tags) {
      const checkinRes = await t.app.inject({
        method: "POST",
        url: "/api/v1/staff/events",
        headers: { cookie },
        payload: {
          clientEventId: randomUUID(),
          occurredAt: booking.window.endsAt,
          type: "checkin",
          payload: { bikeAssetTag: tag },
        },
      });
      expect(checkinRes.statusCode, `checkin ${tag}`).toBe(200);
      expect(checkinRes.json()).toMatchObject({ status: "applied" });
    }
    const returnedRentals = await db.select().from(rentals).where(eq(rentals.reservationId, booking.reservationId));
    expect(returnedRentals.every((r) => r.status === "returned")).toBe(true);
    const pendingBikes = await db.select().from(bikes).where(eq(bikes.category, "commuter"));
    expect(pendingBikes.filter((b) => tags.includes(b.assetTag)).every((b) => b.state === "pending_inspection")).toBe(true);

    // --- Inspection `pass` on each rental (FR-RNT-03): -> completed + available
    for (const rental of returnedRentals) {
      const inspectionRes = await t.app.inject({
        method: "POST",
        url: "/api/v1/staff/events",
        headers: { cookie },
        payload: {
          clientEventId: randomUUID(),
          occurredAt: booking.window.endsAt,
          type: "inspection",
          payload: {
            rentalId: rental.id,
            result: "pass",
            checklist: {
              frame: "ok",
              brakes: "ok",
              tires: "ok",
              chain: "ok",
              saddle: "ok",
              handlebar_gears: "ok",
            },
            photoKeys: [`uploads/checklist/${randomUUID()}.jpg`],
          },
        },
      });
      expect(inspectionRes.statusCode, `inspection ${inspectionRes.body}`).toBe(200);
      expect(inspectionRes.json()).toMatchObject({ status: "applied" });
    }

    // --- Final AC state: 2 completed rentals, bikes available, reservation fulfilled
    const doneRentals = await db.select().from(rentals).where(eq(rentals.reservationId, booking.reservationId));
    expect(doneRentals).toHaveLength(2);
    expect(doneRentals.every((r) => r.status === "completed")).toBe(true);
    const finalBikes = await db.select().from(bikes).where(eq(bikes.category, "commuter"));
    const rentedTags = finalBikes.filter((b) => tags.includes(b.assetTag));
    expect(rentedTags).toHaveLength(2);
    expect(rentedTags.every((b) => b.state === "available" && b.currentOutletId === offering.outletId)).toBe(true);
    const [finalRes] = await db.select().from(reservations).where(eq(reservations.id, booking.reservationId));
    expect(finalRes.status).toBe("fulfilled");
  });
});
