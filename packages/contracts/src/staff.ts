/**
 * Staff event contracts (SRS 3.4 V-rules, 3.5 endpoint table, 6.6 FR-OFF-01,
 * FR-RNT-01..03/05, FR-INV-05.1).
 *
 * Wire shape (offline PWA, FR-OFF-01.1): one event is
 * `{clientEventId, occurredAt, type, payload}` — discriminated by `type`.
 * The canonical per-type schemas below are the discriminated union
 * {@link staffEventSchema}; the transport-level envelope
 * {@link staffEventEnvelopeSchema} keeps `payload` open because structural
 * payload validity is CLASSIFIED per event server-side (FR-OFF-01.3:
 * rejected/flagged verdicts, never a wholesale batch failure).
 *
 * Photo bounds: `condition.min_photos`/`condition.max_photos` (section 4) are
 * enforced by the handler against the config; the schemas carry the static
 * 0..8 ceiling that matches the seeded config.
 */
import { z } from "zod";
import {
  vAssetTag,
  vCategoryCode,
  vChecklist,
  vClientEventId,
  vCollateral,
  vIdr,
  vPhotoKey,
  vTextL,
  vTs,
  vUuid,
} from "./validation";

/* ------------------------------------------------------------------ */
/* Event type + clock rule                                             */
/* ------------------------------------------------------------------ */

export const staffEventTypeSchema = z.enum([
  "checkout",
  "checkin",
  "inspection",
  "bike_status_change",
  "incident",
]);
export type StaffEventType = z.infer<typeof staffEventTypeSchema>;

/**
 * SRS 6.6: `occurredAt` is device time and must not run ahead of the server
 * by more than 5 minutes. Exported as a dedicated guarded variant (plus the
 * raw predicate for boundary tests): a batch replay must CLASSIFY a violating
 * event (per-item verdict, FR-OFF-01.3) rather than fail the whole request at
 * the HTTP boundary, so the guarded schema is applied at the classification
 * layer, not inside the transport envelope.
 */
export const OCCURRED_AT_MAX_AHEAD_MS = 5 * 60_000;

export function occurredAtAheadOfServer(occurredAt: string, now: number = Date.now()): boolean {
  const t = Date.parse(occurredAt);
  return Number.isFinite(t) && t > now + OCCURRED_AT_MAX_AHEAD_MS;
}

export const serverClockGuardedOccurredAtSchema = vTs.refine(
  (s) => !occurredAtAheadOfServer(s),
  { message: "V-TS" },
);

/* ------------------------------------------------------------------ */
/* Per-type payloads (single source — reused by the API service layer) */
/* ------------------------------------------------------------------ */

/** FR-RNT-01 checkout payload. Tag count must equal `reservation.quantity`
 * (V-QTY, 1..5) — validated in the handler against the reservation row. */
export const checkoutPayloadSchema = z
  .object({
    /** Signed voucher JWT (FR-SEC-01); bounded at 2048 chars. */
    voucherToken: z.string().min(8).max(2048),
    bikeAssetTags: z.array(vAssetTag).min(1).max(64),
    checklist: vChecklist,
    photoKeys: z.array(vPhotoKey).max(8),
    /** Physical collateral collected offline (V-COLLATERAL); REQUIRED in the
     * handler (missing -> rejected `COLLATERAL_REQUIRED`). */
    collateral: vCollateral.optional(),
    /** Offline balance = finalIdr - dpIdr; the handler verifies the amount. */
    balanceCollection: z
      .object({ amountIdr: vIdr, method: z.enum(["cash", "qris"]) })
      .strict()
      .optional(),
  })
  .strict();

/** FR-RNT-02 check-in: one bike at a time, no renter involvement (INV-3). */
export const checkinPayloadSchema = z.object({ bikeAssetTag: vAssetTag }).strict();

/** FR-RNT-03 inspection: photoKeys 0..8; damage_found needs >=1 photo AND a
 * V-TEXT-L description. */
export const inspectionPayloadSchema = z
  .object({
    rentalId: vUuid,
    result: z.enum(["pass", "damage_found", "maintenance_required"]),
    checklist: vChecklist,
    photoKeys: z.array(vPhotoKey).max(8),
    damageDescription: vTextL.optional(),
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

/** Section 5.1 staff-legal bike state changes (admin-only ones are flagged). */
export const bikeStatusChangePayloadSchema = z
  .object({
    bikeAssetTag: vAssetTag,
    to: z.enum(["available", "maintenance", "unavailable"]),
    reason: vTextL,
  })
  .strict();

/** FR-RNT-05 incidents; mechanical_failure requires an open rental. */
export const incidentPayloadSchema = z
  .object({
    incidentType: z.enum(["mechanical_failure", "bike_missing", "bike_damaged"]),
    bikeAssetTag: vAssetTag,
    rentalId: vUuid.optional(),
    notes: vTextL,
    photoKeys: z.array(vPhotoKey).max(8).optional(),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* One event: transport envelope + canonical discriminated union       */
/* ------------------------------------------------------------------ */

/**
 * Transport-level shape of ONE staff event. `payload` stays an open record:
 * the handler classifies it per type (rejected/flagged verdicts —
 * FR-OFF-01.3), so a structurally invalid event in an offline replay must
 * yield a per-item verdict, not an HTTP-level batch failure.
 */
export const staffEventEnvelopeSchema = z
  .object({
    clientEventId: vClientEventId,
    occurredAt: vTs,
    type: staffEventTypeSchema,
    payload: z.record(z.string().min(1), z.unknown()).default({}),
  })
  .strict();

const staffEventShape = {
  clientEventId: vClientEventId,
  occurredAt: serverClockGuardedOccurredAtSchema,
} as const;

export const checkoutEventSchema = z
  .object({ ...staffEventShape, type: z.literal("checkout"), payload: checkoutPayloadSchema })
  .strict();

export const checkinEventSchema = z
  .object({ ...staffEventShape, type: z.literal("checkin"), payload: checkinPayloadSchema })
  .strict();

export const inspectionEventSchema = z
  .object({ ...staffEventShape, type: z.literal("inspection"), payload: inspectionPayloadSchema })
  .strict();

export const bikeStatusChangeEventSchema = z
  .object({
    ...staffEventShape,
    type: z.literal("bike_status_change"),
    payload: bikeStatusChangePayloadSchema,
  })
  .strict();

export const incidentEventSchema = z
  .object({ ...staffEventShape, type: z.literal("incident"), payload: incidentPayloadSchema })
  .strict();

/** Canonical discriminated union by `type` (OpenAPI 3.1 / NFR-11, T-14). */
export const staffEventSchema = z.discriminatedUnion("type", [
  checkoutEventSchema,
  checkinEventSchema,
  inspectionEventSchema,
  bikeStatusChangeEventSchema,
  incidentEventSchema,
]);

export type StaffEvent = z.infer<typeof staffEventSchema>;
export type CheckoutEvent = z.infer<typeof checkoutEventSchema>;
export type CheckinEvent = z.infer<typeof checkinEventSchema>;
export type InspectionEvent = z.infer<typeof inspectionEventSchema>;
export type BikeStatusChangeEvent = z.infer<typeof bikeStatusChangeEventSchema>;
export type IncidentEvent = z.infer<typeof incidentEventSchema>;

/* ------------------------------------------------------------------ */
/* Batch + health sync + photo upload                                  */
/* ------------------------------------------------------------------ */

/** FR-OFF-01.4: a batch carries 1..50 events (oldest-occurredAt-first sync). */
export const STAFF_EVENT_BATCH_MAX = 50;

export const staffEventBatchSchema = z
  .object({
    events: z.array(staffEventEnvelopeSchema).min(1).max(STAFF_EVENT_BATCH_MAX),
  })
  .strict();

export type StaffEventBatch = z.infer<typeof staffEventBatchSchema>;

/** FR-INV-05.1: five-minute health sync; physical counts keyed by V-CAT. */
export const healthSyncSchema = z
  .object({
    sentAt: vTs,
    physicalCounts: z.record(vCategoryCode, z.number().int().min(0)).optional(),
  })
  .strict();

export type HealthSyncInput = z.infer<typeof healthSyncSchema>;

/** A.5.1 / FR-RNT-01 photo upload: presigned URL request, <= 5 MiB images. */
export const uploadUrlSchema = z
  .object({
    kind: z.enum(["checklist", "damage"]),
    contentType: z.string().regex(/^image\/(jpeg|png|webp)$/, "V-PHOTO-KEY"),
    sizeBytes: z.number().int().min(1).max(5_242_880),
  })
  .strict();

export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;
