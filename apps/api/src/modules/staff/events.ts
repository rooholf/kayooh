/**
 * Staff event ingestion (FR-OFF-01, FR-RNT-01/02/03, FR-RNT-05, FR-INV-04).
 *
 * Every staff action is an event `{clientEventId, occurredAt, type, payload}`.
 * Per event, in ONE transaction: `scan_events` insert (ON CONFLICT
 * (client_event_id) DO NOTHING) -> classification -> apply; the stored row
 * keeps the classification (idempotent replay: a repeated `clientEventId`
 * returns the first result, nothing is applied twice).
 *
 * Classification (SRS FR-OFF-01.3):
 *   applied  — well-formed and physically possible; effects committed
 *   flagged  — well-formed but physically impossible; bike/rental state NOT
 *              changed; appears in the admin flagged-scan queue
 *   rejected — schema invalid / bad voucher / unknown entity; nothing applied
 *
 * Offline semantics live HERE, not in the client: a batch is processed in
 * ascending `occurredAt` regardless of the arrival order, and every
 * time-based rule reads `occurredAt`, not receipt time.
 */
import { z } from "zod";
import { and, eq, sql } from "@repo/db";
import {
  bikeEvents,
  bikes,
  deposits,
  depositClaims,
  notifications,
  outboxEvents,
  outletCategories,
  paymentIntents,
  refunds,
  rentals,
  renters,
  reservations,
  scanEvents,
  type Database,
  type TxOrDb,
} from "@repo/db";
import {
  vAssetTag,
  vCategoryCode,
  vChecklist,
  vClientEventId,
  vIdr,
  vPhotoKey,
  vTextL,
  vTs,
  vUuid,
} from "@repo/contracts";
import { verifyVoucher } from "../../lib/voucher.js";
import { AppError } from "../../lib/errors.js";
import { getConfig } from "../app-config/index.js";
import { flagReallocationCandidates } from "../reallocation/index.js";

export type StaffEventType =
  | "checkout"
  | "checkin"
  | "inspection"
  | "bike_status_change"
  | "incident";

export type ScanStatus = "applied" | "flagged" | "rejected";

export interface StaffEventInput {
  clientEventId: string;
  occurredAt: string;
  type: StaffEventType;
  payload: Record<string, unknown>;
}

/** Per-item verdict (SRS FR-OFF-01.4 batch shape). */
export interface ScanVerdict {
  clientEventId: string;
  status: ScanStatus;
  reason?: string;
}

export interface StaffContext {
  staffOutletId: string;
  staffUserId: string;
}

type ClassifyingVerdict = { status: Exclude<ScanStatus, "applied">; reason: string } | { status: "applied" };

/* ------------------------------------------------------------------ */
/* Wire schemas (strict, so unknown fields are rejected)               */
/* ------------------------------------------------------------------ */

const STAFF_EVENT_TYPES: readonly StaffEventType[] = [
  "checkout",
  "checkin",
  "inspection",
  "bike_status_change",
  "incident",
];

const staffEventBaseSchema = z
  .object({
    clientEventId: vClientEventId,
    occurredAt: vTs,
    type: z.enum(["checkout", "checkin", "inspection", "bike_status_change", "incident"]),
    payload: z.record(z.string().min(1), z.unknown()).default({}),
  })
  .strict();

const checkoutPayloadSchema = z
  .object({
    voucherToken: z.string().min(8).max(512),
    bikeAssetTag: vAssetTag,
    checklist: vChecklist,
    photoKeys: z.array(vPhotoKey).max(64),
  })
  .strict();

const checkinPayloadSchema = z.object({ bikeAssetTag: vAssetTag }).strict();

const inspectionPayloadSchema = z
  .object({
    rentalId: vUuid,
    result: z.enum(["pass", "damage_found", "maintenance_required"]),
    checklist: vChecklist,
    photoKeys: z.array(vPhotoKey).max(64),
    damageDescription: vTextL.optional(),
    claimAmountIdr: vIdr.optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (
      val.result === "damage_found" &&
      (val.damageDescription === undefined || val.photoKeys.length < 1)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "damage_found requires damageDescription and at least one photo",
      });
    }
  });

const bikeStatusPayloadSchema = z
  .object({
    bikeAssetTag: vAssetTag,
    to: z.enum(["available", "maintenance", "unavailable"]),
    reason: vTextL,
  })
  .strict();

const incidentPayloadSchema = z
  .object({
    incidentType: z.enum(["mechanical_failure", "bike_missing", "bike_damaged"]),
    bikeAssetTag: vAssetTag,
    rentalId: vUuid.optional(),
    notes: vTextL,
    photoKeys: z.array(vPhotoKey).max(64).optional(),
  })
  .strict();

const PAYLOAD_SCHEMAS: Record<StaffEventType, z.ZodTypeAny> = {
  checkout: checkoutPayloadSchema,
  checkin: checkinPayloadSchema,
  inspection: inspectionPayloadSchema,
  bike_status_change: bikeStatusPayloadSchema,
  incident: incidentPayloadSchema,
};

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const flagged = (reason: string): ClassifyingVerdict => ({ status: "flagged", reason });
const rejected = (reason: string): ClassifyingVerdict => ({ status: "rejected", reason });
const applied: ClassifyingVerdict = { status: "applied" };

function rawRows<T>(res: unknown): T[] {
  const rows = (res as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows.filter(Boolean) as T[]) : [];
}

function isoDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function replayVerdict(row: { clientEventId: string; status: string; flagReason: string | null }): ScanVerdict {
  return {
    clientEventId: row.clientEventId,
    status: row.status as ScanStatus,
    ...(row.flagReason ? { reason: row.flagReason } : {}),
  };
}

/**
 * One transaction per event: scan_events insert (ON CONFLICT DO NOTHING) ->
 * classification -> final status update -> apply. A concurrently replayed
 * clientEventId loses the insert race and returns the stored first result.
 */
async function classifyAndApply(
  db: Database,
  event: StaffEventInput,
  ctx: StaffContext,
  classifier: (tx: TxOrDb) => Promise<ClassifyingVerdict>,
): Promise<ScanVerdict> {
  const occurredAt = isoDate(event.occurredAt);
  try {
    return await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(scanEvents)
        .values({
          clientEventId: event.clientEventId,
          staffId: ctx.staffUserId,
          outletId: ctx.staffOutletId,
          type: event.type,
          payload: event.payload,
          occurredAt,
          status: "applied",
        })
        .onConflictDoNothing()
        .returning({ id: scanEvents.id, clientEventId: scanEvents.clientEventId, status: scanEvents.status, flagReason: scanEvents.flagReason });
      const scan = inserted[0];
      if (!scan) {
        // Idempotent replay: return the FIRST stored result (FR-OFF-01.2).
        const stored = await tx
          .select({ clientEventId: scanEvents.clientEventId, status: scanEvents.status, flagReason: scanEvents.flagReason })
          .from(scanEvents)
          .where(eq(scanEvents.clientEventId, event.clientEventId))
          .limit(1);
        const row = stored[0];
        if (!row) return { clientEventId: event.clientEventId, status: "rejected" as const, reason: "INTERNAL" };
        return replayVerdict(row);
      }

      const verdict = await classifier(tx);

      // INV-6 hygiene: the resolved metadata is updateable while the raw
      // payload never is (the 0001 trigger guards the other columns).
      await tx
        .update(scanEvents)
        .set({ status: verdict.status, flagReason: verdict.status === "applied" ? null : (verdict as { reason: string }).reason })
        .where(eq(scanEvents.id, scan.id));

      return { clientEventId: event.clientEventId, status: verdict.status, ...((verdict as { reason?: string }).reason ? { reason: (verdict as { reason: string }).reason } : {}) };
    });
  } catch (e) {
    // Duplicate on the insert: the losing writer replays the stored verdict.
    const err = e as { code?: string; constraint?: string };
    if (err.code === "23505") {
      const stored = await db
        .select({ clientEventId: scanEvents.clientEventId, status: scanEvents.status, flagReason: scanEvents.flagReason })
        .from(scanEvents)
        .where(eq(scanEvents.clientEventId, event.clientEventId))
        .limit(1);
      const row = stored[0];
      if (row) return replayVerdict(row);
    }
    throw e;
  }
}

/** The staff outlet's owner id (checkin FR-RNT-02.2 + rentals.ownerId). */
async function outletOwnerId(exec: TxOrDb, outletId: string): Promise<string | null> {
  const res = await exec.execute(sql`SELECT owner_id FROM outlets WHERE id = ${outletId}::uuid`);
  const rows = rawRows<{ owner_id: string }>(res);
  return rows[0]?.owner_id ?? null;
}

/* ------------------------------------------------------------------ */
/* checkout (FR-RNT-01)                                                */
/* ------------------------------------------------------------------ */

async function applyCheckout(tx: TxOrDb, event: StaffEventInput, ctx: StaffContext): Promise<ClassifyingVerdict> {
  const payload = checkoutPayloadSchema.safeParse(event.payload);
  if (!payload.success) return rejected("VALIDATION_ERROR");

  // Step 1: voucher signature + exp against occurredAt (FR-RNT-01.1).
  const voucher = verifyVoucher(payload.data.voucherToken, isoDate(event.occurredAt));
  if (!voucher.ok) return rejected(voucher.code);

  const photoCount = payload.data.photoKeys.length;
  const [minPhotos, maxPhotos] = await Promise.all([getConfig("condition.min_photos"), getConfig("condition.max_photos")]);
  if (photoCount < minPhotos || photoCount > maxPhotos) return rejected("VALIDATION_ERROR");

  // Step 2: reservation + bike rows FOR UPDATE, bike first (FR-RNT-01.2).
  const bike = (
    await tx.select().from(bikes).where(eq(bikes.assetTag, payload.data.bikeAssetTag)).limit(1).for("update")
  )[0];
  const reservation = (
    await tx.select().from(reservations).where(eq(reservations.id, voucher.reservationId)).limit(1).for("update")
  )[0];

  if (!bike || !reservation) return rejected("NOT_FOUND");

  // Step 3: flag ladder — first failure wins (FR-RNT-01.3).
  if (reservation.status !== "confirmed") {
    return flagged("RESERVATION_NOT_CONFIRMED");
  }
  if (reservation.outletId !== ctx.staffOutletId || bike.currentOutletId !== ctx.staffOutletId) {
    return flagged("WRONG_OUTLET");
  }
  if (bike.category !== reservation.category) return flagged("CATEGORY_MISMATCH");
  if (bike.state !== "available") return flagged("BIKE_NOT_AVAILABLE");

  const earlyMinutes = await getConfig("checkout.early_minutes");
  if (isoDate(event.occurredAt).getTime() < isoDate(reservation.startsAt).getTime() - earlyMinutes * 60_000) {
    return flagged("TOO_EARLY");
  }

  // Step 4: apply (FR-RNT-01.4).
  const occurredAt = isoDate(event.occurredAt);
  await tx.update(reservations).set({ status: "fulfilled" }).where(eq(reservations.id, reservation.id));
  await tx.update(bikes).set({ state: "in_rental" }).where(eq(bikes.id, bike.id));

  const rental = (await tx
    .insert(rentals)
    .values({
      reservationId: reservation.id,
      renterId: reservation.renterId,
      bikeId: bike.id,
      ownerId: bike.ownerId,
      checkoutOutletId: ctx.staffOutletId,
      checkedOutAt: occurredAt,
      expectedEndAt: reservation.endsAt,
      status: "open",
      checkoutChecklist: payload.data.checklist,
    })
    .returning({ id: rentals.id }))[0];
  if (!rental) throw new Error("rental insert returned no row");

  await tx.insert(bikeEvents).values({
    bikeId: bike.id,
    ownerId: bike.ownerId,
    type: "checked_out",
    fromState: bike.state,
    toState: "in_rental",
    outletId: ctx.staffOutletId,
    staffId: ctx.staffUserId,
    rentalId: rental.id,
    clientEventId: event.clientEventId,
    photoKeys: payload.data.photoKeys,
    payload: { checklist: payload.data.checklist },
    occurredAt,
  });

  await tx.insert(outboxEvents).values({
    type: "rental.checked_out",
    payload: { rentalId: rental.id, reservationId: reservation.id, bikeId: bike.id },
  });

  return applied;
}

/* ------------------------------------------------------------------ */
/* checkin (FR-RNT-02)                                                 */
/* ------------------------------------------------------------------ */

async function applyCheckin(tx: TxOrDb, event: StaffEventInput, ctx: StaffContext): Promise<ClassifyingVerdict> {
  const payload = checkinPayloadSchema.safeParse(event.payload);
  if (!payload.success) return rejected("VALIDATION_ERROR");

  const bike = (
    await tx.select().from(bikes).where(eq(bikes.assetTag, payload.data.bikeAssetTag)).limit(1).for("update")
  )[0];
  if (!bike) return rejected("NOT_FOUND");

  const rental = (
    await tx
      .select()
      .from(rentals)
      .where(and(eq(rentals.bikeId, bike.id), eq(rentals.status, "open")))
      .limit(1)
      .for("update")
  )[0];
  if (!rental) return flagged("NO_OPEN_RENTAL");

  const staffOwner = await outletOwnerId(tx, ctx.staffOutletId);
  if (staffOwner !== null && staffOwner !== bike.ownerId) {
    return flagged("WRONG_OWNER_OUTLET");
  }

  // Late calculation (FR-RNT-02.4). occurredAt is authoritative.
  const occurredAt = isoDate(event.occurredAt);
  const expectedEndAt = isoDate(rental.expectedEndAt);
  const lateMinutes = rental.mechanicalFailure
    ? 0
    : Math.max(0, Math.floor((occurredAt.getTime() - expectedEndAt.getTime()) / 60_000));
  let lateFeeIdr = BigInt(0);
  if (lateMinutes > 0 && !rental.mechanicalFailure) {
    const grace = await getConfig("late.grace_minutes");
    if (lateMinutes > grace) {
      const feePerHour = await getConfig("late.fee_per_started_hour_idr");
      lateFeeIdr = BigInt(Math.ceil(lateMinutes / 60) * feePerHour);
    }
  }

  await tx
    .update(rentals)
    .set({ checkedInAt: occurredAt, checkinOutletId: ctx.staffOutletId, status: "returned", lateMinutes, lateFeeIdr })
    .where(eq(rentals.id, rental.id));
  const newBikeCurrentOutlet = bike.currentOutletId !== ctx.staffOutletId ? ctx.staffOutletId : bike.currentOutletId;
  await tx.update(bikes).set({ state: "pending_inspection", currentOutletId: newBikeCurrentOutlet }).where(eq(bikes.id, bike.id));

  await tx.insert(bikeEvents).values({
    bikeId: bike.id,
    ownerId: bike.ownerId,
    type: "checked_in",
    fromState: bike.state,
    toState: "pending_inspection",
    outletId: ctx.staffOutletId,
    staffId: ctx.staffUserId,
    rentalId: rental.id,
    clientEventId: event.clientEventId,
    occurredAt,
  });

  // Fee collection (FR-RNT-02.5): deposit deduction floors the balance at 0;
  // any shortfall becomes a late_fee payment intent.
  if (lateFeeIdr > 0) {
    const collectionMethod = await getConfig("late.collection_method");
    const depositRows = await tx
      .select({ id: deposits.id, balanceIdr: deposits.balanceIdr })
      .from(deposits)
      .where(eq(deposits.renterId, rental.renterId))
      .limit(1);
    const deposit = depositRows[0];
    if (collectionMethod === "deposit_deduction" && deposit) {
      const balance = Number(deposit.balanceIdr);
      const deduction = Math.min(balance, Number(lateFeeIdr));
      const shortfall = Number(lateFeeIdr) - deduction;
      await tx.update(deposits).set({ balanceIdr: BigInt(balance - deduction) }).where(eq(deposits.id, deposit.id));
      if (shortfall > 0) {
        await tx.insert(paymentIntents).values({
          purpose: "late_fee",
          renterId: rental.renterId,
          rentalId: rental.id,
          amountIdr: BigInt(shortfall),
          status: "created",
        });
      }
    } else {
      await tx.insert(paymentIntents).values({
        purpose: "late_fee",
        renterId: rental.renterId,
        rentalId: rental.id,
        amountIdr: lateFeeIdr,
        status: "created",
      });
    }
  }

  return applied;
}

/* ------------------------------------------------------------------ */
/* inspection (FR-RNT-03)                                              */
/* ------------------------------------------------------------------ */

async function applyInspection(tx: TxOrDb, event: StaffEventInput, ctx: StaffContext): Promise<ClassifyingVerdict> {
  const payload = inspectionPayloadSchema.safeParse(event.payload);
  if (!payload.success) return rejected("VALIDATION_ERROR");

  const rental = (await tx.select().from(rentals).where(eq(rentals.id, payload.data.rentalId)).limit(1).for("update"))[0];
  if (!rental) return rejected("NOT_FOUND");
  if (rental.status !== "returned") return flagged("NOT_RETURNED");

  const [minPhotos, maxPhotos] = await Promise.all([getConfig("condition.min_photos"), getConfig("condition.max_photos")]);
  if (payload.data.photoKeys.length < minPhotos || payload.data.photoKeys.length > maxPhotos) {
    return rejected("VALIDATION_ERROR");
  }
  if (rental.mechanicalFailure && payload.data.result === "pass") {
    return flagged("RESULT_MISMATCH");
  }

  const occurredAt = isoDate(event.occurredAt);
  const bike = (await tx.select().from(bikes).where(eq(bikes.id, rental.bikeId)).limit(1).for("update"))[0];
  if (!bike) return rejected("NOT_FOUND");

  const toState = payload.data.result === "pass" ? "available" : "maintenance";
  await tx.update(rentals).set({ status: "completed", completedAt: occurredAt }).where(eq(rentals.id, rental.id));
  await tx.update(bikes).set({ state: toState }).where(eq(bikes.id, bike.id));

  await tx.insert(bikeEvents).values({
    bikeId: bike.id,
    ownerId: bike.ownerId,
    type: "inspected",
    fromState: bike.state,
    toState,
    outletId: ctx.staffOutletId,
    staffId: ctx.staffUserId,
    rentalId: rental.id,
    clientEventId: event.clientEventId,
    photoKeys: payload.data.photoKeys,
    payload: { result: payload.data.result, checklist: payload.data.checklist },
    occurredAt,
  });

  await tx.insert(outboxEvents).values({
    type: "rental.completed",
    payload: { rentalId: rental.id, reservationId: rental.reservationId, result: payload.data.result },
  });

  if (payload.data.result === "damage_found" && payload.data.claimAmountIdr !== undefined && payload.data.claimAmountIdr > 0) {
    await tx.insert(depositClaims).values({
      rentalId: rental.id,
      ownerId: rental.ownerId,
      renterId: rental.renterId,
      amountIdr: BigInt(payload.data.claimAmountIdr),
      description: payload.data.damageDescription ?? "",
      photoKeys: payload.data.photoKeys,
      status: "proposed",
    });
  }

  return applied;
}

/* ------------------------------------------------------------------ */
/* bike_status_change (section 5.1 transition table)                   */
/* ------------------------------------------------------------------ */

type BikeState = (typeof bikes.$inferSelect)["state"];

function transitionAllowed(from: BikeState, to: Exclude<BikeState, "in_rental" | "pending_inspection" | "reserved" | "held" | "charging">): { ok: boolean; adminOnly?: boolean } {
  if (from === "available" && (to === "maintenance" || to === "unavailable")) return { ok: true };
  if (from === "maintenance" && to === "available") return { ok: true };
  if (from === "unavailable" && to === "available") return { ok: true, adminOnly: true };
  return { ok: false };
}

async function applyBikeStatusChange(tx: TxOrDb, event: StaffEventInput, ctx: StaffContext): Promise<ClassifyingVerdict> {
  const payload = bikeStatusPayloadSchema.safeParse(event.payload);
  if (!payload.success) return rejected("VALIDATION_ERROR");

  const bike = (
    await tx.select().from(bikes).where(eq(bikes.assetTag, payload.data.bikeAssetTag)).limit(1).for("update")
  )[0];
  if (!bike) return rejected("NOT_FOUND");

  const allowed = transitionAllowed(bike.state, payload.data.to);
  if (!allowed.ok) return flagged("ILLEGAL_TRANSITION");
  if (allowed.adminOnly) return flagged("ROLE_NOT_ALLOWED"); // staff cannot widen the fleet (SRS 6.6)

  await tx.update(bikes).set({ state: payload.data.to }).where(eq(bikes.id, bike.id));
  await tx.insert(bikeEvents).values({
    bikeId: bike.id,
    ownerId: bike.ownerId,
    type: "state_changed",
    fromState: bike.state,
    toState: payload.data.to,
    outletId: ctx.staffOutletId,
    staffId: ctx.staffUserId,
    clientEventId: event.clientEventId,
    occurredAt: isoDate(event.occurredAt),
    payload: { reason: payload.data.reason },
  });

  // A fleet-state change can strand confirmed reservations — run FR-INV-04.
  if (payload.data.to === "maintenance" || payload.data.to === "unavailable") {
    await flagReallocationCandidates(tx as Database, bike.homeOutletId, bike.category, isoDate(event.occurredAt));
  }

  return applied;
}

/* ------------------------------------------------------------------ */
/* incident (FR-RNT-05 + FR-INV-04)                                    */
/* ------------------------------------------------------------------ */

async function applyIncident(tx: TxOrDb, event: StaffEventInput, ctx: StaffContext): Promise<ClassifyingVerdict> {
  const payload = incidentPayloadSchema.safeParse(event.payload);
  if (!payload.success) return rejected("VALIDATION_ERROR");

  const bike = (
    await tx.select().from(bikes).where(eq(bikes.assetTag, payload.data.bikeAssetTag)).limit(1).for("update")
  )[0];
  if (!bike) return rejected("NOT_FOUND");

  const occurredAt = isoDate(event.occurredAt);
  const openRental = (
    await tx
      .select()
      .from(rentals)
      .where(and(eq(rentals.bikeId, bike.id), eq(rentals.status, "open")))
      .limit(1)
      .for("update")
  )[0];

  if (payload.data.incidentType === "mechanical_failure") {
    if (!openRental) return flagged("NO_OPEN_RENTAL");
    await tx.update(rentals).set({ mechanicalFailure: true }).where(eq(rentals.id, openRental.id));
    const intentRows = await tx
      .select({ id: paymentIntents.id, amountIdr: paymentIntents.amountIdr })
      .from(paymentIntents)
      .where(and(eq(paymentIntents.reservationId, openRental.reservationId), eq(paymentIntents.purpose, "booking")))
      .limit(1);
    const intent = intentRows[0];
    if (intent) {
      await tx.update(paymentIntents).set({ status: "refunded" }).where(eq(paymentIntents.id, intent.id));
      await tx.insert(refunds).values({
        paymentIntentId: intent.id,
        reservationId: openRental.reservationId,
        rentalId: openRental.id,
        amountIdr: intent.amountIdr,
        reason: "mechanical_failure",
        status: "pending",
      });
    }
    await tx.insert(notifications).values({
      userId: (await tx
        .select({ userId: renters.userId })
        .from(renters)
        .where(eq(renters.id, openRental.renterId))
        .limit(1))[0]?.userId ?? null,
      channel: "whatsapp",
      template: "refund_issued",
      vars: { reason: "mechanical_failure", amountIdr: Number(intent?.amountIdr ?? 0) },
      status: "queued",
    });
    await tx.insert(bikeEvents).values({
      bikeId: bike.id,
      ownerId: bike.ownerId,
      type: "incident_reported",
      fromState: bike.state,
      toState: bike.state,
      outletId: ctx.staffOutletId,
      staffId: ctx.staffUserId,
      rentalId: openRental.id,
      clientEventId: event.clientEventId,
      photoKeys: payload.data.photoKeys ?? [],
      occurredAt,
      payload: { incidentType: payload.data.incidentType, notes: payload.data.notes },
    });
    return applied;
  }

  // bike_missing | bike_damaged -> run FR-INV-04.
  if (bike.state !== "available" && bike.state !== "pending_inspection") {
    return flagged("BIKE_NOT_AVAILABLE");
  }
  const toState = payload.data.incidentType === "bike_missing" ? "unavailable" : "maintenance";
  await tx.update(bikes).set({ state: toState }).where(eq(bikes.id, bike.id));

  await tx.insert(bikeEvents).values({
    bikeId: bike.id,
    ownerId: bike.ownerId,
    type: "incident_reported",
    fromState: bike.state,
    toState,
    outletId: ctx.staffOutletId,
    staffId: ctx.staffUserId,
    rentalId: payload.data.rentalId ?? null,
    clientEventId: event.clientEventId,
    photoKeys: payload.data.photoKeys ?? [],
    occurredAt,
    payload: { incidentType: payload.data.incidentType, notes: payload.data.notes },
  });

  await flagReallocationCandidates(tx as Database, bike.homeOutletId, bike.category, occurredAt);
  return applied;
}

/* ------------------------------------------------------------------ */
/* Public entry points                                                 */
/* ------------------------------------------------------------------ */

const CLASSIFIERS: Record<StaffEventType, (tx: TxOrDb, event: StaffEventInput, ctx: StaffContext) => Promise<ClassifyingVerdict>> = {
  checkout: applyCheckout,
  checkin: applyCheckin,
  inspection: applyInspection,
  bike_status_change: applyBikeStatusChange,
  incident: applyIncident,
};

/** Applies one event (online single-event endpoint, FR-OFF-01.4). */
export async function applyStaffEvent(db: Database, raw: unknown, ctx: StaffContext): Promise<ScanVerdict> {
  const results = await applyStaffEvents(db, [raw], ctx);
  const first = results[0];
  if (!first) throw new AppError("INTERNAL", "No verdict produced by the staff-event pipeline.");
  return first;
}

/**
 * Applies a batch in ascending occurredAt (offline sync replay, FR-OFF-01.1/5).
 * The batch endpoint is the ONLY place where ordering is applied: the PWA may
 * replay out-of-order after reconnection, and the server outcome must be
 * identical to processing them in chronological order.
 */
export async function applyStaffEvents(db: Database, rawEvents: unknown[], ctx: StaffContext): Promise<ScanVerdict[]> {
  const events = [...rawEvents];
  type Work = StaffEventInput;
  const parsed = events.map((raw, index) => {
    const base = staffEventBaseSchema.safeParse(raw);
    if (!base.success) {
      return {
        index,
        event: null,
        verdict: {
          clientEventId:
            typeof (raw as { clientEventId?: unknown })?.clientEventId === "string"
              ? ((raw as { clientEventId: string }).clientEventId)
              : "",
          status: "rejected" as const,
          reason: "VALIDATION_ERROR",
        },
      };
    }
    return { index, event: base.data as Work, verdict: null };
  });
  parsed.sort((a, b) => {
    // Sort by occurredAt, then arrival index (stable within the same instant).
    if (a.event && b.event) {
      const da = isoDate(a.event.occurredAt).getTime();
      const dbb = isoDate(b.event.occurredAt).getTime();
      return da !== dbb ? da - dbb : a.index - b.index;
    }
    return a.index - b.index;
  });

  const results: ScanVerdict[] = new Array<ScanVerdict>(events.length);
  for (const item of parsed) {
    if (!item.event) {
      results[item.index] = item.verdict as ScanVerdict;
      continue;
    }
    const verdict = await classifyAndApply(db, item.event, ctx, (tx) => CLASSIFIERS[item.event.type](tx, item.event, ctx));
    results[item.index] = verdict;
  }
  return results.filter((v): v is ScanVerdict => v !== undefined);
}
