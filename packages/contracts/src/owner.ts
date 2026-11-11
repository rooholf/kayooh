/**
 * Owner portal contracts (SRS 7.2 endpoint table, FR-ID-03 RLS scope,
 * FR-REP-01, FR-LED-05.1 disputes).
 *
 * Every owner route resolves `app.owner_id` from the session and runs under
 * RLS (FR-ID-03); these schemas only fix the request/response shapes.
 */
import { z } from "zod";
import { vAssetTag, vCategoryCode, vCursor, vLimit, vTextL, vTs, vUuid } from "./validation";
import { bikeStateSchema } from "./admin";

/** Postgres enum `rental_status` (SRS section 5). */
export const rentalStatusSchema = z.enum(["open", "returned", "completed"]);
export type RentalStatus = z.infer<typeof rentalStatusSchema>;

/* ------------------------------------------------------------------ */
/* List queries                                                        */
/* ------------------------------------------------------------------ */

export const ownerRentalsQuerySchema = z
  .object({
    status: rentalStatusSchema.optional(),
    from: vTs.optional(),
    to: vTs.optional(),
    limit: vLimit,
    cursor: vCursor,
  })
  .strict();
export type OwnerRentalsQuery = z.infer<typeof ownerRentalsQuerySchema>;

export const ownerBikesQuerySchema = z
  .object({
    outletId: vUuid.optional(),
    state: bikeStateSchema.optional(),
    category: vCategoryCode.optional(),
    limit: vLimit,
    cursor: vCursor,
  })
  .strict();
export type OwnerBikesQuery = z.infer<typeof ownerBikesQuerySchema>;

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/** PATCH /owner/outlets/{outletId}/categories/{category} — safetyBuffer is
 * 0 or 1; the handler rejects when inService - buffer < 0. */
export const ownerCategoryParamsSchema = z.object({ outletId: vUuid, category: vCategoryCode });
export type OwnerCategoryParams = z.infer<typeof ownerCategoryParamsSchema>;

export const ownerCategoryPatchSchema = z
  .object({ safetyBuffer: z.union([z.literal(0), z.literal(1)]) })
  .strict();
export type OwnerCategoryPatchBody = z.infer<typeof ownerCategoryPatchSchema>;

/** PATCH /owner/settings — applies to future reservations only (A-08). */
export const ownerSettingsPatchSchema = z.object({ promoOptOut: z.boolean() }).strict();
export type OwnerSettingsPatchBody = z.infer<typeof ownerSettingsPatchSchema>;

/** FR-LED-05.1: raise a payout dispute within the 7-day window. */
export const createOwnerDisputeSchema = z
  .object({ payoutId: vUuid, reason: vTextL })
  .strict();
export type CreateOwnerDisputeBody = z.infer<typeof createOwnerDisputeSchema>;

/* ------------------------------------------------------------------ */
/* GET /owner/dashboard/summary response (FR-REP-01)                   */
/* ------------------------------------------------------------------ */

export const ownerDashboardSummarySchema = z
  .object({
    outlets: z.array(
      z
        .object({
          outletId: vUuid,
          code: z.string(),
          name: z.string(),
          categories: z.array(
            z
              .object({
                category: vCategoryCode,
                bikesByState: z.record(z.string(), z.number().int().min(0)),
                heldCount: z.number().int().min(0),
                confirmedCount: z.number().int().min(0),
              })
              .strict(),
          ),
          openRentals: z.array(
            z
              .object({
                bikeAssetTag: vAssetTag,
                renterPhoneMasked: z.string(),
                checkedOutAt: vTs,
                expectedEndAt: vTs,
                overdue: z.boolean(),
                escalationStage: z.number().int().min(0),
              })
              .strict(),
          ),
          lateReturns: z.number().int().min(0),
        })
        .strict(),
    ),
    /** Integer rupiah accumulated as a decimal string (bigint over JSON). */
    grossAccruedIdr: z.string().regex(/^\d+$/),
  })
  .strict();
export type OwnerDashboardSummary = z.infer<typeof ownerDashboardSummarySchema>;
