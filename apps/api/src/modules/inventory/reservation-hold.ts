/**
 * createReservationHold — FR-INV-02 (the reservation "hold"), executed as the
 * SKILL build_transactional_inventory_lock. Money is integer rupiah end to end
 * (INV-5); the lock and the capacity counting are RAW SQL (INV-2, AGENTS
 * directive: no ORM for the lock).
 *
 * Order of operations (SRS FR-INV-02 — first failure returns):
 *   Pre-transaction validation (uncharged reads, outside the lock):
 *     1. schema (done by route) -> resolve the booking identity: an
 *        authenticated session resolves to its renter row; an unauthenticated
 *        request resolves or creates the guest `renters` row keyed by phone
 *        (A-17, revision 1.2 guest checkout)
 *     2. phone guard: A-19 active-reservation cap (409 DUPLICATE_RESOURCE)
 *     3. duration / slot / lead-time checks (422 DURATION/WINDOW_OUT_OF_RANGE)
 *     4. startsAt and endsAt inside the outlet's WIB hours (422 OUTSIDE_OPENING_HOURS)
 *     5. outlet active and (outletId, category) active (422 CATEGORY_NOT_OFFERED)
 *   Single READ COMMITTED transaction (NFR-02: SET LOCAL lock_timeout = '3s'):
 *     1. SELECT ... FOR UPDATE on outlet_categories      <- THE LOCK (INV-2)
 *     2. computeAvailability; available < quantity -> 409 SOLD_OUT
 *     3. quote() (FR-PRC-01)
 *     4. dpIdr = roundHalfUp(finalIdr * booking.dp_rate_bps / 10000)  (INV-5)
 *     5. insert reservation (held; directly confirmed when dpIdr = 0)
 *     6. insert payment_intents (skipped when dpIdr = 0)
 *     7. insert outbox reservation.held (skipped when dpIdr = 0)
 *     COMMIT
 *   After commit (never inside the lock): invoice the ONLINE DP via the
 *   PaymentGateway seam with an 8 s timeout; success stores gateway_ref/
 *   payment_url on the intent and answers 201 {reservation, price, paymentUrl};
 *   failure cancels the reservation (cancel_reason = gateway_error), fails the
 *   intent and answers 502 GATEWAY_UNAVAILABLE. The remainder of the charge is
 *   collected offline by staff at check-out (FR-RNT-01). The BullMQ release-hold
 *   enqueue arrives with FR-INV-03; until then correctness is covered by the
 *   sweeper design rule ("Redis loss never loses a booking", FR-INV-03).
 */
import { and, eq, inArray, sql } from "@repo/db";
import {
  db,
  outboxEvents,
  outletCategories,
  outlets,
  paymentIntents,
  renters,
  reservations,
  type Database,
} from "@repo/db";
import type { CreateReservationBody, CreateReservationResponse } from "@repo/contracts";
import { AppError } from "../../lib/errors.js";
import { signGuestToken, GUEST_TOKEN_TTL_MS } from "../../lib/guest-token.js";
import { getConfig } from "../app-config/index.js";
import { createPaymentGateway, withGatewayTimeout, GATEWAY_TIMEOUT_MS } from "../payments/index.js";
import { quote } from "../pricing/index.js";
import { computeAvailability, type QueryExecutor } from "./availability.js";
import { isSlotAligned, isOpenAt } from "./opening-hours.js";
import { enqueueReleaseHold } from "../jobs/index.js";
import { enqueueNotification } from "../notifications/index.js";
import { publishAvailability } from "../sse/index.js";

/** INV-5: half-up division on non-negative bigints (no floating point). */
function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

interface HoldTransactionResult {
  reservationId: string;
  intentId: string | null;
  /** FR-INV-02.4: the amount to invoice online — the 50% DP, not the total. */
  chargeIdr: number;
  expiresAt: Date | null;
}

async function holdReservation(
  pooledDb: Database,
  args: {
    body: CreateReservationBody;
    renterId: string;
    ownerId: string;
    startsAt: Date;
    endsAt: Date;
  },
): Promise<HoldTransactionResult> {
  const { body, renterId, ownerId, startsAt, endsAt } = args;
  // FR-INV-02 (V-QTY): one reservation locks `quantity` bikes; default 1.
  const quantity = body.quantity ?? 1;

  return pooledDb.transaction(
    async (tx) => {
      // NFR-02: every reservation transaction declares its lock budget.
      await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);

      // ---- 1. THE LOCK: raw SQL, FOR UPDATE — the only availability gate ----
      const lockRes = (await tx.execute(sql`
        SELECT safety_buffer FROM outlet_categories
        WHERE outlet_id = ${body.outletId} AND category = ${body.category}
        FOR UPDATE
      `)) as unknown as { rows: Array<{ safety_buffer: string | number } | undefined> };
      if (lockRes.rows.length === 0) {
        // Vanished between pre-check and lock (admin deactivation race).
        throw new AppError("STATE_CONFLICT", "Offering changed; retry.");
      }

      // ---- 2. availability: committed data only (INV-2) ----------------------
      const available = await computeAvailability(tx as QueryExecutor, {
        outletId: body.outletId,
        category: body.category,
        startsAt,
        endsAt,
      });
      if (available < quantity) {
        throw new AppError("SOLD_OUT", "No bikes available for this window.");
      }

      // ---- 3. price quote (FR-PRC-01) ----------------------------------------
      const q = await quote(tx as QueryExecutor, {
        outletId: body.outletId,
        category: body.category,
        startsAt,
        endsAt,
        promoCode: body.promoCode,
      });

      const holdSeconds = (await getConfig("hold.checkout_minutes")) * 60;
      // FR-INV-02.4 / INV-5: 50% down payment, integer bigint only.
      const dpRateBps = BigInt(await getConfig("booking.dp_rate_bps"));
      const dpIdr = roundHalfUp(BigInt(q.finalIdr) * dpRateBps, 10_000n);
      const directConfirm = dpIdr === 0n;

      // ---- 4. the reservation row --------------------------------------------
      const inserted = await tx
        .insert(reservations)
        .values({
          renterId,
          outletId: body.outletId,
          ownerId,
          category: body.category,
          quantity,
          startsAt,
          endsAt,
          status: directConfirm ? "confirmed" : "held",
          expiresAt: directConfirm ? null : (sql`(now() + make_interval(secs => ${holdSeconds}))` as unknown as Date),
          confirmedAt: directConfirm ? (sql`now()` as unknown as Date) : null,
          // INV-5: integer rupiah; bigint columns take BigInt params.
          priceIdr: BigInt(q.priceIdr),
          discountIdr: BigInt(q.discountIdr),
          finalIdr: BigInt(q.finalIdr),
          dpIdr,
          promoId: null,
          ownerPromoBps: 0,
          rateSnapshot: { rateIdr: q.rateIdr, unitMinutes: q.unitMinutes, dayType: q.dayType },
        })
        .returning({
          id: reservations.id,
          expiresAt: reservations.expiresAt,
          finalIdr: reservations.finalIdr,
          priceIdr: reservations.priceIdr,
          discountIdr: reservations.discountIdr,
          status: reservations.status,
          confirmedAt: reservations.confirmedAt,
          atRisk: reservations.atRisk,
        });
      const reservation = inserted[0];
      if (!reservation) throw new AppError("INTERNAL", "reservation insert returned no row");

      // ---- 5. payment intent (pressed only when money is due) -----------------
      let intentId: string | null = null;
      if (!directConfirm) {
        const intent = await tx
          .insert(paymentIntents)
          .values({
            purpose: "booking",
            renterId,
            reservationId: reservation.id,
            amountIdr: dpIdr,
            status: "created",
            expiresAt: reservation.expiresAt,
          })
          .returning({ id: paymentIntents.id });
        const intentRow = intent[0];
        if (!intentRow) throw new AppError("INTERNAL", "payment intent insert returned no row");
        intentId = intentRow.id;
      }

      // ---- 6. outbox event (same transaction; free bookings skip step 5-6) ----
      if (!directConfirm) {
        await tx.insert(outboxEvents).values({
          type: "reservation.held",
          payload: {
            reservationId: reservation.id,
            renterId,
            outletId: body.outletId,
            category: body.category,
            intentId,
            expiresAt: reservation.expiresAt?.toISOString() ?? null,
          },
        });
      }

      return {
        reservationId: reservation.id,
        intentId,
        chargeIdr: Number(dpIdr),
        expiresAt: reservation.expiresAt,
      };
    },
    { isolationLevel: "read committed" }, // FR-INV-02 (INV-2 relies on it for the recheck)
  );
}

/* ------------------------------------------------------------------ */
/* After-commit legs                                                    */
/* ------------------------------------------------------------------ */

async function loadReservationForResponse(
  pooledDb: Database,
  reservationId: string,
): Promise<{
  id: string;
  outletId: string;
  category: string;
  quantity: number;
  startsAt: Date;
  endsAt: Date;
  status: string;
  expiresAt: Date | null;
  confirmedAt: Date | null;
  priceIdr: bigint;
  discountIdr: bigint;
  finalIdr: bigint;
  dpIdr: bigint;
  atRisk: boolean;
} | undefined> {
  const rows = await pooledDb
    .select({
      id: reservations.id,
      outletId: reservations.outletId,
      category: reservations.category,
      quantity: reservations.quantity,
      startsAt: reservations.startsAt,
      endsAt: reservations.endsAt,
      status: reservations.status,
      expiresAt: reservations.expiresAt,
      confirmedAt: reservations.confirmedAt,
      priceIdr: reservations.priceIdr,
      discountIdr: reservations.discountIdr,
      finalIdr: reservations.finalIdr,
      dpIdr: reservations.dpIdr,
      atRisk: reservations.atRisk,
    })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  return rows[0];
}

const iso = (d: Date): string => d.toISOString(); // always ends in Z (SRS 3.1)
const idr = (v: bigint): number => Number(v); // exact for |v| < 2^53 (INV-5)

function toResource(row: NonNullable<Awaited<ReturnType<typeof loadReservationForResponse>>>) {
  return {
    id: row.id,
    outletId: row.outletId,
    category: row.category,
    quantity: row.quantity,
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    status: row.status as "held" | "confirmed",
    expiresAt: row.expiresAt === null ? null : iso(row.expiresAt),
    priceIdr: idr(row.priceIdr),
    discountIdr: idr(row.discountIdr),
    finalIdr: idr(row.finalIdr),
    dpIdr: idr(row.dpIdr),
    atRisk: row.atRisk,
  };
}

/** Gateway failure compensation (FR-INV-02 post-commit): cancel + fail + 502. */
async function compensateGatewayFailure(reservationId: string, intentId: string | null): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(reservations)
      .set({ status: "cancelled", cancelReason: "gateway_error" })
      .where(and(eq(reservations.id, reservationId), eq(reservations.status, "held")));
    if (intentId !== null) {
      await tx
        .update(paymentIntents)
        .set({ status: "failed" })
        .where(and(eq(paymentIntents.id, intentId), eq(paymentIntents.status, "created")));
    }
  });
}

/* ------------------------------------------------------------------ */
/* Booking identity (FR-INV-02 steps 1-2, A-17 / A-19)                 */
/* ------------------------------------------------------------------ */

/**
 * The resolved booking identity for a reservation (revision 1.2). An
 * authenticated session is a renter; an unauthenticated checkout is a guest
 * identified by `contactPhone`.
 */
export type ReservationActor =
  | { kind: "renter"; userId: string }
  | { kind: "guest"; phone: string };

/**
 * FR-INV-02 step 1 (A-17): an authenticated session resolves to the `renters`
 * row keyed by its user; an unauthenticated request resolves or creates the
 * guest row keyed by `contactPhone` with `user_id = NULL`. The phone is the
 * booking identity, so a guest phone that later signs up keeps its bookings.
 */
async function resolveRenter(pooledDb: Database, actor: ReservationActor): Promise<string> {
  if (actor.kind === "renter") {
    const rows = await pooledDb
      .select({ id: renters.id })
      .from(renters)
      .where(eq(renters.userId, actor.userId))
      .limit(1);
    const row = rows[0];
    if (!row) throw new AppError("STATE_CONFLICT", "Renter profile does not exist for this user.");
    return row.id;
  }
  // Guest: race-safe on the phone unique index (A-17).
  const inserted = await pooledDb
    .insert(renters)
    .values({ userId: null, phone: actor.phone })
    .onConflictDoNothing({ target: renters.phone })
    .returning({ id: renters.id });
  if (inserted[0]) return inserted[0].id;
  const raced = await pooledDb
    .select({ id: renters.id })
    .from(renters)
    .where(eq(renters.phone, actor.phone))
    .limit(1);
  const row = raced[0];
  if (!row) throw new AppError("INTERNAL", "Guest renter row could not be resolved.");
  return row.id;
}

/**
 * FR-INV-02 step 2 (A-19): a booking identity already holding
 * `booking.max_active_reservations_per_phone` reservations in status
 * `held`/`confirmed` is refused 409 DUPLICATE_RESOURCE. Backstop only — the
 * 50% DP is the primary anti-spam and no-show control.
 */
async function enforceActiveReservationCap(pooledDb: Database, renterId: string): Promise<void> {
  const max = await getConfig("booking.max_active_reservations_per_phone");
  const active = await pooledDb
    .select({ id: reservations.id })
    .from(reservations)
    .where(and(eq(reservations.renterId, renterId), inArray(reservations.status, ["held", "confirmed"])));
  if (active.length >= max) {
    throw new AppError("DUPLICATE_RESOURCE", "This phone already holds the maximum active reservations.");
  }
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                   */
/* ------------------------------------------------------------------ */

export async function createReservationHold(
  pooledDb: Database,
  body: CreateReservationBody,
  actor: ReservationActor,
): Promise<CreateReservationResponse> {
  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);

  /* -------- Step 1: resolve the booking identity (pre-check 1, A-17) ------- */
  const renterId = await resolveRenter(pooledDb, actor);

  /* -------- Step 2: phone guard (pre-check 2, A-19) ------------------------ */
  await enforceActiveReservationCap(pooledDb, renterId);

  /* -------- Step 3: duration and window (pre-check 3) ---------------------- */
  const [slotMinutes, minDuration, maxDuration, maxAdvanceDays, minLeadMinutes] = await Promise.all([
    getConfig("booking.slot_minutes"),
    getConfig("booking.min_duration_minutes"),
    getConfig("booking.max_duration_minutes"),
    getConfig("booking.max_advance_days"),
    getConfig("booking.min_lead_minutes"),
  ]);

  // Server time source is the database now() (SRS 3.1).
  const nowRes = (await pooledDb.execute(sql`SELECT now() AS now_ts`)) as unknown as {
    rows: Array<{ now_ts: Date | string } | undefined>;
  };
  const nowRaw = nowRes.rows[0]?.now_ts;
  if (!nowRaw) throw new AppError("INTERNAL", "Database clock unavailable.");
  // node-pg normally yields Date; drizzle's raw path may hand back the ISO string.
  const now = nowRaw instanceof Date ? nowRaw : new Date(nowRaw);
  const nowMs = now.getTime();

  const durationMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
  if (
    endsAt.getTime() <= startsAt.getTime() ||
    durationMinutes < minDuration ||
    durationMinutes > maxDuration ||
    durationMinutes % slotMinutes !== 0
  ) {
    throw new AppError("DURATION_OUT_OF_RANGE", "Reservation duration is outside the booking rules.");
  }
  if (!isSlotAligned(startsAt, slotMinutes)) {
    throw new AppError("WINDOW_OUT_OF_RANGE", `startsAt must align to ${slotMinutes}-minute slots and UTC seconds.`);
  }
  if (
    startsAt.getTime() < nowMs + minLeadMinutes * 60_000 ||
    startsAt.getTime() > nowMs + maxAdvanceDays * 86_400_000
  ) {
    throw new AppError("WINDOW_OUT_OF_RANGE", "startsAt is outside the bookable window.");
  }

  /* -------- Step 4: opening hours, WIB, both edges (pre-check 4) ----------- */
  const outletRows = await pooledDb
    .select({
      id: outlets.id,
      status: outlets.status,
      hours: outlets.hours,
      ownerId: outlets.ownerId,
    })
    .from(outlets)
    .where(eq(outlets.id, body.outletId))
    .limit(1);
  const outletRow = outletRows[0];
  if (!outletRow) throw new AppError("NOT_FOUND", "Outlet does not exist.");

  if (!isOpenAt(outletRow.hours, startsAt) || !isOpenAt(outletRow.hours, endsAt)) {
    throw new AppError("OUTSIDE_OPENING_HOURS", "Requested window is outside the outlet's opening hours.");
  }

  /* -------- Step 5: outlet active and offering active (pre-check 5) -------- */
  const offeringRows = await pooledDb
    .select({ active: outletCategories.active })
    .from(outletCategories)
    .where(and(eq(outletCategories.outletId, body.outletId), eq(outletCategories.category, body.category)))
    .limit(1);
  const offeringRow = offeringRows[0];
  if (!offeringRow || !offeringRow.active || outletRow.status !== "active") {
    throw new AppError("CATEGORY_NOT_OFFERED", "This category is not offered at the outlet.");
  }

  /* -------- THE TRANSACTION (steps 1-6 inside, lock held) ------------------ */
  let result: HoldTransactionResult;
  try {
    result = await holdReservation(pooledDb, {
      body,
      renterId,
      ownerId: outletRow.ownerId,
      startsAt,
      endsAt,
    });
  } catch (e) {
    // NFR-02: on lock timeout return 503 INTERNAL with Retry-After: 1.
    if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "55P03") {
      const err = new AppError(
        "INTERNAL",
        "Reservation lock contention; retry shortly.",
        undefined,
        503, // NFR-02: 503 INTERNAL with Retry-After: 1
      );
      (err as AppError & { retryAfterSec: number }).retryAfterSec = 1;
      throw err;
    }
    throw e;
  }

  /* -------- After commit (never inside the lock) --------------------------- */
  // SRS FR-INV-02 post-commit: enqueue the release-hold delayed job (job id
  // `hold:<reservationId>`). Best-effort — the sweeper is the correctness floor.
  if (result.expiresAt) {
    await enqueueReleaseHold(result.reservationId, result.expiresAt, process.env.REDIS_URL);
  }

  // FR-REP-02: a committed hold consumes quantity — push one availability
  // event for (outletId, category). Post-commit, so the count includes it.
  void publishAvailability(pooledDb, body.outletId, body.category);

  if (result.intentId !== null) {
    try {
      const gateway = createPaymentGateway({ nodeEnv: process.env.NODE_ENV ?? "development" });
      const invoice = await withGatewayTimeout(
        gateway.createInvoice({
          externalId: result.intentId,
          amount: result.chargeIdr,
          durationSeconds: (await getConfig("hold.checkout_minutes")) * 60,
        }),
        GATEWAY_TIMEOUT_MS,
      );
      await pooledDb
        .update(paymentIntents)
        .set({ gatewayRef: invoice.gatewayRef, paymentUrl: invoice.paymentUrl, status: "pending" })
        .where(and(eq(paymentIntents.id, result.intentId), eq(paymentIntents.status, "created")));
    } catch {
      // SRS FR-INV-02: gateway failure = cancelled reservation + failed intent
      // + 502 GATEWAY_UNAVAILABLE (the idempotency marker is reclaimed by the
      // plugin's stall window, so the retry with the same key works).
      await compensateGatewayFailure(result.reservationId, result.intentId);
      // FR-REP-02: the cancellation restored the held quantity.
      void publishAvailability(pooledDb, body.outletId, body.category);
      throw new AppError(
        "GATEWAY_UNAVAILABLE",
        "The payment gateway did not accept the invoice; the hold was released.",
      );
    }
  }

  const row = await loadReservationForResponse(pooledDb, result.reservationId);
  if (!row) throw new AppError("INTERNAL", "Reservation vanished after commit.");
  const resource = toResource(row);

  const response: CreateReservationResponse = {
    reservation: resource,
    price: {
      priceIdr: resource.priceIdr,
      discountIdr: resource.discountIdr,
      finalIdr: resource.finalIdr,
      dpIdr: resource.dpIdr,
    },
  };
  if (result.intentId !== null && resource.status === "held") {
    const intentRows = await pooledDb
      .select({ paymentUrl: paymentIntents.paymentUrl })
      .from(paymentIntents)
      .where(eq(paymentIntents.id, result.intentId))
      .limit(1);
    const url = intentRows[0]?.paymentUrl;
    if (url) response.paymentUrl = url;
  }

  // A-18: a guest booking gets a reservation-scoped access token, returned in
  // the 201 and delivered by WhatsApp. Guests have no session and no list.
  if (actor.kind === "guest") {
    const guestToken = signGuestToken({
      reservationId: result.reservationId,
      expiresAt: new Date(Date.now() + GUEST_TOKEN_TTL_MS),
    });
    response.guestToken = guestToken;

    // FR-NOT-01.4: delivery rides the outbox; a messaging failure must never
    // block the booking — the token already rides the 201 response.
    try {
      await enqueueNotification(pooledDb, {
        userId: null,
        template: "guest_reservation_access",
        channel: "whatsapp",
        to: actor.phone,
        vars: {
          guestToken,
          reservationId: result.reservationId,
          outletId: resource.outletId,
          category: resource.category,
          startsAt: resource.startsAt,
          endsAt: resource.endsAt,
        },
      });
    } catch {
      // Best-effort: the outbox retries; the 201 must still return the token.
    }
  }
  return response;
}
