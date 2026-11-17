/**
 * T-04 (FR-PAY-02) — payment webhook + the FR-PAY-03 refund leg, against the
 * REAL Postgres cluster (NFR-09) with the `FakeGateway`.
 *
 * Covers the SRS AC (SRS §6.5):
 *   - the same paid event delivered twice changes the DB ONCE (dedupe on
 *     `UNIQUE (provider, event_id)`),
 *   - a bad callback token is 401 and stores nothing,
 *   - a wrong paid amount changes nothing (event processed + admin audit),
 *   - a DP payment arriving after expiry with capacity below `quantity`
 *     produces EXACTLY ONE refund row (`late_payment_sold_out`),
 *   - EXPIRED/FAILED only move the intent (the sweeper reclaims the hold).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { eq, sql } from "@repo/db";
import {
  auditLog,
  db,
  outboxEvents,
  paymentIntents,
  paymentWebhookEvents,
  refunds,
  reservations,
} from "@repo/db";
import { buildTestApp, truncateAll, type TestApp } from "./helpers.js";
import { nextWindow, actorFor, seedOffering, seedRenter } from "./staff.helpers.js";
import { createReservationHold } from "../src/modules/inventory/index.js";
import type { CreateReservationBody } from "@repo/contracts";

const WEBHOOK_URL = "/webhooks/kasera";

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

function signBody(body: Record<string, unknown>): Record<string, string> {
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET ?? "dev-fake-webhook-secret").update(`${ts}.${raw}`).digest("hex");
  return { "Kasera-Signature-V1": `t=${ts},v1=${v1}` };
}

async function postWebhook(body: Record<string, unknown>, headers?: Record<string, string>) {
  return await t.app.inject({ method: "POST", url: WEBHOOK_URL, headers: headers ?? signBody(body), payload: body });
}

interface HeldBooking {
  outletId: string;
  ownerId: string;
  reservationId: string;
  intentId: string;
  intentAmountIdr: bigint;
  window: { startsAt: string; endsAt: string };
}

/** Books through FR-INV-02 (so the DP intent mirrors production) and returns it. */
async function heldBooking(quantity = 1): Promise<HeldBooking> {
  const partner = await seedOffering(Math.max(1, quantity));
  const renter = await seedRenter();
  const window = nextWindow();
  const body: CreateReservationBody = {
    outletId: partner.outletId,
    category: "commuter",
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    quantity,
  };
  const held = await createReservationHold(db, body, actorFor(renter.userId));
  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.reservationId, held.reservation.id))
    .limit(1);
  if (!intent) throw new Error("expected a booking payment intent");
  return {
    outletId: partner.outletId,
    ownerId: partner.ownerId,
    reservationId: held.reservation.id,
    intentId: intent.id,
    intentAmountIdr: intent.amountIdr,
    window,
  };
}

describe("T-04 (FR-PAY-02): webhook is idempotent and reconciles the DP", () => {
  it("applies a paid event once; a replayed event changes nothing", async () => {
    const b = await heldBooking();
    const event = {
      id: "evt-dup-1",
      type: "payment.paid",
      data: { external_id: b.intentId, amount: Number(b.intentAmountIdr) },
    };

    const first = await postWebhook(event);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ status: "processed" });

    const second = await postWebhook(event);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ status: "duplicate" });

    const [res] = await db.select().from(reservations).where(eq(reservations.id, b.reservationId));
    expect(res.status).toBe("confirmed");
    expect(res.confirmedAt).not.toBeNull();

    const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, b.intentId));
    expect(intent.status).toBe("paid");

    // ONE stored event and ONE confirmation side effect.
    expect(await db.select().from(paymentWebhookEvents)).toHaveLength(1);
    expect(await db.select().from(outboxEvents).where(eq(outboxEvents.type, "reservation.confirmed"))).toHaveLength(1);
  });

  it("rejects a bad callback token (401) and stores nothing", async () => {
    const b = await heldBooking();
    const badBody = { id: "evt-bad", type: "payment.paid", data: { external_id: b.intentId, amount: Number(b.intentAmountIdr) } };
    const ts = Math.floor(Date.now() / 1000);
    const res = await postWebhook(
      badBody,
      { "Kasera-Signature-V1": `t=${ts},v1=not-the-secret` },
    );
    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe("WEBHOOK_SIGNATURE_INVALID");

    expect(await db.select().from(paymentWebhookEvents)).toHaveLength(0);
    const [row] = await db.select().from(reservations).where(eq(reservations.id, b.reservationId));
    expect(row.status).toBe("held");
  });

  it("ignores a mismatched paid amount: no state change, event processed + audit", async () => {
    const b = await heldBooking();
    const res = await postWebhook({
      id: "evt-wrong-amount",
      type: "payment.paid",
      data: { external_id: b.intentId, amount: Number(b.intentAmountIdr) + 1 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "mismatch" });

    const [row] = await db.select().from(reservations).where(eq(reservations.id, b.reservationId));
    expect(row.status).toBe("held"); // unchanged
    const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, b.intentId));
    expect(intent.status).toBe("pending"); // unchanged

    const events = await db.select().from(paymentWebhookEvents);
    expect(events).toHaveLength(1);
    expect(events[0].processedAt).not.toBeNull();

    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "payment.amount_mismatch"));
    expect(audits).toHaveLength(1);
  });

  it("refunds a late DP in full when capacity is gone: exactly one refund row", async () => {
    const partner = await seedOffering(1);
    const renterA = await seedRenter();
    const window = nextWindow();
    const heldA = await createReservationHold(
      db,
      { outletId: partner.outletId, category: "commuter", startsAt: window.startsAt, endsAt: window.endsAt, quantity: 1 },
      actorFor(renterA.userId),
    );
    const [intentA] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.reservationId, heldA.reservation.id))
      .limit(1);

    // Expire A's hold (the sweeper's job) so it stops counting...
    await db.execute(sql`UPDATE reservations SET status = 'expired' WHERE id = ${heldA.reservation.id}::uuid`);
    await db.execute(sql`UPDATE payment_intents SET status = 'expired' WHERE id = ${intentA.id}::uuid`);
    // ...then fill the ONLY bike with another CONFIRMED reservation -> capacity 0.
    const renterB = await seedRenter();
    await db.insert(reservations).values({
      renterId: renterB.renterId,
      outletId: partner.outletId,
      ownerId: partner.ownerId,
      category: "commuter",
      quantity: 1,
      startsAt: new Date(window.startsAt),
      endsAt: new Date(window.endsAt),
      status: "confirmed",
      confirmedAt: new Date(),
      priceIdr: 10_000n,
      finalIdr: 10_000n,
      dpIdr: 5_000n,
      ownerPromoBps: 0,
      rateSnapshot: { rateIdr: 10_000, unitMinutes: 60, dayType: "weekday" },
    });

    // The late DP arrives after expiry.
    const res = await postWebhook({
      id: "evt-late",
      type: "payment.paid",
      data: { external_id: intentA.id, amount: Number(intentA.amountIdr) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "refunded" });

    // A stays expired — never confirmed.
    const [rowA] = await db.select().from(reservations).where(eq(reservations.id, heldA.reservation.id));
    expect(rowA.status).toBe("expired");

    const refundRows = await db.select().from(refunds);
    expect(refundRows).toHaveLength(1); // exactly one
    expect(refundRows[0].reason).toBe("late_payment_sold_out");
    expect(refundRows[0].amountIdr).toBe(intentA.amountIdr);
    expect(refundRows[0].status).toBe("failed"); // Kasera cannot refund QRIS (manual)

    const [intentAfter] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, intentA.id));
    expect(intentAfter.status).toBe("paid"); // refund failed; intent stays paid
  });

  it("does NOT confirm a late DP when free capacity is below quantity (INV-2)", async () => {
    // quantity = 2, but only 1 bike free at payment time: a partial fit is
    // SOLD OUT — the DP must be refunded, never a partial confirmation.
    const heldA = await heldBooking(2);
    await db.execute(sql`UPDATE reservations SET status = 'expired' WHERE id = ${heldA.reservationId}::uuid`);
    await db.execute(sql`UPDATE payment_intents SET status = 'expired' WHERE id = ${heldA.intentId}::uuid`);
    // Fill exactly ONE of the two bikes with another confirmed reservation.
    const renterB = await seedRenter();
    await db.insert(reservations).values({
      renterId: renterB.renterId,
      outletId: heldA.outletId,
      ownerId: heldA.ownerId,
      category: "commuter",
      quantity: 1,
      startsAt: new Date(heldA.window.startsAt),
      endsAt: new Date(heldA.window.endsAt),
      status: "confirmed",
      confirmedAt: new Date(),
      priceIdr: 10_000n,
      finalIdr: 10_000n,
      dpIdr: 5_000n,
      ownerPromoBps: 0,
      rateSnapshot: { rateIdr: 10_000, unitMinutes: 60, dayType: "weekday" },
    });

    const res = await postWebhook({
      id: "evt-late-qty",
      type: "payment.paid",
      data: { external_id: heldA.intentId, amount: Number(heldA.intentAmountIdr) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "refunded" });

    // A stays expired — never confirmed with fewer bikes than it reserved.
    const [rowA] = await db.select().from(reservations).where(eq(reservations.id, heldA.reservationId));
    expect(rowA.status).toBe("expired");
    const refundRows = await db.select().from(refunds);
    expect(refundRows).toHaveLength(1);
    expect(refundRows[0].reason).toBe("late_payment_sold_out");
    expect(refundRows[0].amountIdr).toBe(heldA.intentAmountIdr);
  });

  it("EXPIRED moves only the intent (the sweeper reclaims the hold)", async () => {
    const b = await heldBooking();
    const res = await postWebhook({
      id: "evt-expired",
      type: "payment.expired",
      data: { external_id: b.intentId, amount: 0 },
    });
    expect(res.statusCode).toBe(200);

    const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, b.intentId));
    expect(intent.status).toBe("expired");
    // INV-2: the webhook never releases capacity; the reservation stays `held`
    // until the sweeper expires it.
    const [row] = await db.select().from(reservations).where(eq(reservations.id, b.reservationId));
    expect(row.status).toBe("held");
  });
});
