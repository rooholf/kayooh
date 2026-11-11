import { z } from "zod";

/* Canonical V-* rules live in validation.ts; keep the short aliases. */
export {
  ERROR_CODES,
  ERROR_STATUS,
  type ErrorCode,
  type ErrorDetail,
  type ErrorEnvelope,
} from "./errors";
export {
  vAssetTag,
  vCategoryCode,
  vCollateral,
  vChecklist,
  vChecklistStatus,
  vClientEventId,
  vCursor,
  vEmail,
  vIdempotencyKey,
  vHours,
  vIdr,
  vLat,
  vLng,
  vLimit,
  vOutletCode,
  vPassword,
  vPhone,
  vPhotoKey,
  vPromo,
  vQty,
  vTextL,
  vTextS,
  vTs,
  vUuid,
  vWeekKey,
  isValidNominalPhone,
  normalizeEmail,
  normalizePhone,
} from "./validation";

export * from "./reservations";
export * from "./catalog";
export * from "./staff";
export * from "./admin";
export * from "./owner";
export * from "./sse";

import * as v from "./validation";

/* Legacy aliases (pre-step-2 scaffolding names), kept as thin wrappers. */
export const uuidSchema = z.string().uuid();
export const idrSchema = v.vIdr;
export const phoneSchema = v.vPhone;
export const emailSchema = v.vEmail;
export const passwordSchema = v.vPassword;
export const categoryCodeSchema = v.vCategoryCode;
export const assetTagSchema = v.vAssetTag;
export const outletCodeSchema = v.vOutletCode;
export const timestampSchema = z.string().datetime({ offset: false });
export const weekKeySchema = v.vWeekKey;

export type Uuid = z.infer<typeof uuidSchema>;
export type Idr = z.infer<typeof idrSchema>;
export type CategoryCode = z.infer<typeof categoryCodeSchema>;
