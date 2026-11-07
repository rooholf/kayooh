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
import { vCategoryCode, vCursor, vIdr, vLimit, vPhone, vPromo, vQty, vTs, vUuid } from "./validation";

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

/* ------------------------------------------------------------------ */
/* POST /pricing/quote (FR-PRC-01, endpoint table) — public preview    */
/* ------------------------------------------------------------------ */

/**
 * Public price preview. Same inputs as the pricing leg of FR-INV-02 but with
 * no `quantity` (the quote is per bike, FR-PRC-01.2). `promoCode` needs a
 * session: an unauthenticated request supplying one is 401 `UNAUTHENTICATED`
 * (incentivized auth, revision 1.2); otherwise P1 rejects it 422 `PROMO_INVALID`.
 */
export const quoteBodySchema = z
  .object({
    outletId: vUuid,
    category: vCategoryCode,
    startsAt: vTs,
    endsAt: vTs,
    promoCode: vPromo.optional(),
  })
  .strict();

/** 200 `{priceIdr, discountIdr, finalIdr, dpIdr, units}` (endpoint table). */
export const quoteResponseSchema = z
  .object({
    priceIdr: vIdr,
    discountIdr: vIdr,
    finalIdr: vIdr,
    /** Online 50% down payment (FR-INV-02.4, INV-5 integer rupiah). */
    dpIdr: vIdr,
    /** `ceil(durationMinutes / pricing.billing_unit_minutes)` (FR-PRC-01.2). */
    units: z.number().int().min(1),
  })
  .strict();

export type QuoteBody = z.infer<typeof quoteBodySchema>;
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;

/* ------------------------------------------------------------------ */
/* GET /reservations (renter list, SRS 3.2 pagination)                 */
/* ------------------------------------------------------------------ */

export const listReservationsQuerySchema = z
  .object({
    status: reservationStatusSchema.optional(),
    limit: vLimit,
    cursor: vCursor,
  })
  .strict();

/** List convention (SRS 3.2): `{data: [...], nextCursor: string|null}`. */
export const reservationListResponseSchema = z
  .object({
    data: z.array(reservationResourceSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export type ListReservationsQuery = z.infer<typeof listReservationsQuerySchema>;
export type ReservationListResponse = z.infer<typeof reservationListResponseSchema>;

/* ------------------------------------------------------------------ */
/* GET /reservations/{id}/voucher (FR-SEC-01.1)                        */
/* ------------------------------------------------------------------ */

export const voucherResponseSchema = z
  .object({
    token: z.string().min(1),
    expiresAt: vTs,
  })
  .strict();

export type VoucherResponse = z.infer<typeof voucherResponseSchema>;
