/**
 * POST /reservations contract (SRS 3.5 endpoint table + FR-INV-02).
 *
 * Request body (FR-INV-02): exactly `outletId` (V-UUID), `category` (V-CAT),
 * `startsAt`/`endsAt` (V-TS), `promoCode?` (V-PROMO) — no other fields exist in
 * the SRS. `.strict()` rejects unknown fields with 400 VALIDATION_ERROR
 * (SRS section 2, "Strictness").
 *
 * Header `Idempotency-Key` (UUID) is REQUIRED on this route (SRS 3.2) and is
 * validated against `vIdempotencyKey` (exported from validation.ts).
 *
 * Response 201: `{reservation, price, paymentUrl?}` — `paymentUrl` is absent
 * when `finalIdr = 0` (FR-INV-02.4 / endpoint table). Error responses use the
 * shared {@link ErrorEnvelope} shape (SRS 3.2).
 */
import { z } from "zod";
import { vCategoryCode, vIdr, vPhone, vPromo, vQty, vTs, vUuid } from "./validation";

export const createReservationBodySchema = z
  .object({
    outletId: vUuid,
    category: vCategoryCode,
    /** V-QTY: bikes to lock; defaults to 1 (FR-INV-02). */
    quantity: vQty.optional(),
    startsAt: vTs,
    endsAt: vTs,
    promoCode: vPromo.optional(),
    /**
     * V-PHONE (revision 1.2 guest checkout): REQUIRED when the request is
     * unauthenticated, REJECTED with 400 when it is authenticated.
     */
    contactPhone: vPhone.optional(),
  })
  .strict();

/** Postgres enum `reservation_status` (SRS section 5). */
export const reservationStatusSchema = z.enum([
  "held",
  "confirmed",
  "fulfilled",
  "expired",
  "cancelled",
  "no_show",
]);

/**
 * Reservation resource returned to renters. Fields limited to what the SRS
 * endpoint table lists for `GET /reservations/{id}` (status, expiresAt, price
 * fields, atRisk) plus the identity/window columns the client created.
 */
export const reservationResourceSchema = z
  .object({
    id: vUuid,
    outletId: vUuid,
    category: vCategoryCode,
    /** V-QTY: bikes locked by this reservation (FR-INV-02). */
    quantity: vQty,
    startsAt: vTs,
    endsAt: vTs,
    status: reservationStatusSchema,
    /** NULL once `confirmed` and never afterwards (SRS section 5). */
    expiresAt: vTs.nullable(),
    priceIdr: vIdr,
    discountIdr: vIdr,
    finalIdr: vIdr,
    /** Online 50% down payment; the balance is collected offline (FR-INV-02.4). */
    dpIdr: vIdr,
    atRisk: z.boolean(),
  })
  .strict();

/** The price leg of a reservation (FR-PRC-01 quote output, integer rupiah). */
export const createReservationPriceSchema = z
  .object({
    priceIdr: vIdr,
    discountIdr: vIdr,
    finalIdr: vIdr,
    dpIdr: vIdr,
  })
  .strict();

export const createReservationResponseSchema = z
  .object({
    reservation: reservationResourceSchema,
    price: createReservationPriceSchema,
    /** Absent when `finalIdr = 0` (confirmed directly at insert time). */
    paymentUrl: z.string().url().optional(),
    /**
     * A-18 (revision 1.2): a reservation-scoped signed token returned ONLY when
     * the booking was made as a guest; it grants `GET /reservations/{id}`.
     */
    guestToken: z.string().optional(),
  })
  .strict();

export type CreateReservationBody = z.infer<typeof createReservationBodySchema>;
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;
export type ReservationResource = z.infer<typeof reservationResourceSchema>;
export type CreateReservationPrice = z.infer<typeof createReservationPriceSchema>;
export type CreateReservationResponse = z.infer<typeof createReservationResponseSchema>;
