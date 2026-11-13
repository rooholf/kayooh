/**
 * Admin console contracts (SRS 7.4 endpoint table, FR-CAT-02, FR-SEC-02,
 * FR-PRC-01 P2 promotions, FR-LED-02/04/05 P2 ledger ops).
 *
 * Every admin mutation writes `audit_log` (INV-6) — enforced in the API
 * layer; these schemas are the single request-shape source (NFR-11, C.3.1).
 */
import { z } from "zod";
import {
  vAssetTag,
  vCategoryCode,
  vCursor,
  vHours,
  vIdr,
  vLat,
  vLimit,
  vLng,
  vOutletCode,
  vPassword,
  vPromo,
  vTextL,
  vTextS,
  vTs,
  vUuid,
  vWeekKey,
  vEmail,
} from "./validation.js";

/* ------------------------------------------------------------------ */
/* Shared enums + param shapes                                         */
/* ------------------------------------------------------------------ */

/** Postgres enum `bike_state` (SRS section 5). */
export const bikeStateSchema = z.enum([
  "available",
  "held",
  "reserved",
  "in_rental",
  "pending_inspection",
  "maintenance",
  "unavailable",
  "charging",
]);
export type BikeState = z.infer<typeof bikeStateSchema>;

export const ownerStatusSchema = z.enum(["active", "suspended"]);
export type OwnerStatus = z.infer<typeof ownerStatusSchema>;

/** Public sign-up is disabled for these roles (FR-ID-02) — admin-created. */
export const adminAssignableRoleSchema = z.enum(["staff", "owner", "admin"]);
export type AdminAssignableRole = z.infer<typeof adminAssignableRoleSchema>;

/** `{id}` path params for the admin PATCH routes. */
export const idParamSchema = z.object({ id: vUuid });

/* ------------------------------------------------------------------ */
/* Onboarding (FR-CAT-02)                                              */
/* ------------------------------------------------------------------ */

export const createOwnerSchema = z
  .object({
    name: vTextS,
    bankCode: vTextS,
    bankAccountNumber: z.string().regex(/^[0-9]{6,20}$/),
    bankAccountName: vTextS,
  })
  .strict();
export type CreateOwnerBody = z.infer<typeof createOwnerSchema>;

export const patchOwnerSchema = z.object({ status: ownerStatusSchema }).strict();
export type PatchOwnerBody = z.infer<typeof patchOwnerSchema>;

export const createOutletSchema = z
  .object({
    ownerId: vUuid,
    code: vOutletCode,
    name: vTextS,
    address: vTextS,
    description: vTextL.optional(),
    lat: vLat,
    lng: vLng,
    hours: vHours,
    categories: z.array(vCategoryCode).min(1),
  })
  .strict();
export type CreateOutletBody = z.infer<typeof createOutletSchema>;

/** PATCH may set `status`, `hours`, `name`, `description`, `address`,
 * `lat`, `lng` (SRS 7.4); at least one field must be present. */
export const patchOutletSchema = z
  .object({
    name: vTextS.optional(),
    description: vTextL.optional(),
    address: vTextS.optional(),
    lat: vLat.optional(),
    lng: vLng.optional(),
    hours: vHours.optional(),
    /** Postgres `outlets_status_check` allows active|inactive (owners use
     * active|suspended — see patchOwnerSchema). */
    status: z.enum(["active", "inactive"]).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.name !== undefined ||
      v.description !== undefined ||
      v.address !== undefined ||
      v.lat !== undefined ||
      v.lng !== undefined ||
      v.hours !== undefined ||
      v.status !== undefined,
    { message: "At least one field must be provided" },
  );
export type PatchOutletBody = z.infer<typeof patchOutletSchema>;

export const createBikeSchema = z
  .object({
    assetTag: vAssetTag,
    category: vCategoryCode,
    homeOutletId: vUuid,
  })
  .strict();
export type CreateBikeBody = z.infer<typeof createBikeSchema>;

/** Bulk bike create: max 200 items, all-or-nothing (FR-CAT-02.3). */
export const bulkBikesSchema = z
  .object({ items: z.array(createBikeSchema).min(1).max(200) })
  .strict();
export type BulkBikesBody = z.infer<typeof bulkBikesSchema>;

/** PATCH /admin/bikes/{id}/state — illegal transitions -> 409 STATE_CONFLICT. */
export const bikeStateChangeSchema = z.object({ to: bikeStateSchema, reason: vTextL }).strict();
export type BikeStateChangeBody = z.infer<typeof bikeStateChangeSchema>;

/* ------------------------------------------------------------------ */
/* Users (FR-ID-02)                                                    */
/* ------------------------------------------------------------------ */

export const createUserSchema = z
  .object({
    email: vEmail,
    password: vPassword,
    role: adminAssignableRoleSchema,
    /** Required when `role = staff` (the outlet the staff operate from). */
    outletId: vUuid.optional(),
    /** Required when `role = owner`. */
    ownerId: vUuid.optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.role === "staff" && val.outletId === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "outletId is required for role staff", path: ["outletId"] });
    }
    if (val.role === "owner" && val.ownerId === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ownerId is required for role owner", path: ["ownerId"] });
    }
  });
export type CreateUserBody = z.infer<typeof createUserSchema>;

/* ------------------------------------------------------------------ */
/* Pricing, config, promotions, commission (FR-PRC-01, FR-LED-02)      */
/* ------------------------------------------------------------------ */

export const pricingDayTypeSchema = z.enum(["all", "weekday", "weekend"]);
export type PricingDayType = z.infer<typeof pricingDayTypeSchema>;

/** `rateIdr` is V-IDR and must be > 0 (SRS 7.4 pricing-rules row). */
export const pricingRuleSchema = z
  .object({
    outletId: vUuid.optional(),
    category: vCategoryCode,
    dayType: pricingDayTypeSchema,
    rateIdr: z.number().int().min(1).max(1_000_000_000),
    effectiveFrom: vTs,
  })
  .strict();
export type PricingRuleBody = z.infer<typeof pricingRuleSchema>;

/** `{key, value}`; the key must exist in section 4 and the value is
 * type-checked against that section's schema by the handler. */
export const configPatchSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_.]{1,99}$/),
    value: z.unknown(),
  })
  .strict();
export type ConfigPatchBody = z.infer<typeof configPatchSchema>;

export const promotionKindSchema = z.enum(["percent", "fixed"]);
export type PromotionKind = z.infer<typeof promotionKindSchema>;

/** P2 promotions (SRS 7.4): percent value 1..100, fixed value V-IDR > 0,
 * endsAt > startsAt. */
export const promotionSchema = z
  .object({
    code: vPromo,
    kind: promotionKindSchema,
    value: z.number().int().min(1).max(1_000_000_000),
    maxDiscountIdr: vIdr.optional(),
    startsAt: vTs,
    endsAt: vTs,
    category: vCategoryCode.optional(),
    outletId: vUuid.optional(),
    maxUses: z.number().int().min(1).optional(),
    maxUsesPerRenter: z.number().int().min(1).optional(),
  })
  .strict()
  .refine((v) => v.endsAt > v.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] })
  .refine(
    (v) => (v.kind === "percent" ? v.value >= 1 && v.value <= 100 : v.value >= 1),
    { message: "percent value must be 1..100", path: ["value"] },
  );
export type PromotionBody = z.infer<typeof promotionSchema>;

/** P2 commission rules (FR-LED-02): rateBps integer 0..10000. */
export const commissionBaseSchema = z.enum(["pre_discount", "post_discount"]);
export type CommissionBase = z.infer<typeof commissionBaseSchema>;

export const commissionRuleSchema = z
  .object({
    ownerId: vUuid.optional(),
    rateBps: z.number().int().min(0).max(10_000),
    base: commissionBaseSchema,
    effectiveFrom: vTs,
  })
  .strict();
export type CommissionRuleBody = z.infer<typeof commissionRuleSchema>;

/* ------------------------------------------------------------------ */
/* Operations: flagged scans, audit, disputes, payouts, settlements    */
/* ------------------------------------------------------------------ */

/** FR-SEC-02.2: flagged-scan resolution. */
export const flaggedScanResolveSchema = z
  .object({ resolution: z.enum(["dismissed", "corrected"]), note: vTextL })
  .strict();
export type FlaggedScanResolveBody = z.infer<typeof flaggedScanResolveSchema>;

/** GET /admin/flagged-scans — paging over scan_events status='flagged'. */
export const flaggedScanQuerySchema = z
  .object({
    /** Include already-resolved rows (default: unresolved queue only). */
    includeResolved: z.enum(["true", "false"]).optional(),
    limit: vLimit,
    cursor: vCursor,
  })
  .strict();
export type FlaggedScanQuery = z.infer<typeof flaggedScanQuerySchema>;

/** GET /admin/audit-log filters (SRS 7.4). */
export const auditLogQuerySchema = z
  .object({
    entity: z.string().max(64).optional(),
    actorId: vUuid.optional(),
    from: vTs.optional(),
    to: vTs.optional(),
    limit: vLimit,
    cursor: vCursor,
  })
  .strict();
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

/** FR-LED-05.3: dispute resolution; adjustmentIdr required when upheld. */
export const disputeResolveSchema = z
  .object({
    decision: z.enum(["upheld", "rejected"]),
    note: vTextL,
    adjustmentIdr: vIdr.optional(),
  })
  .strict()
  .refine((v) => v.decision !== "upheld" || v.adjustmentIdr !== undefined, {
    message: "adjustmentIdr is required when upheld",
    path: ["adjustmentIdr"],
  });
export type DisputeResolveBody = z.infer<typeof disputeResolveSchema>;

/** Payout retry / mark-paid path param (SRS 7.4 payouts row). */
export const payoutRetrySchema = z.object({ id: vUuid });
export type PayoutIdParams = z.infer<typeof payoutRetrySchema>;

/** POST /admin/settlements/build — a completed V-WEEK. */
export const settlementBuildSchema = z.object({ weekKey: vWeekKey }).strict();
export type SettlementBuildBody = z.infer<typeof settlementBuildSchema>;
