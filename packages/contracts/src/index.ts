import { z } from "zod";

/* Canonical V-* rules live in validation.ts; keep the short aliases. */
export {
  ERROR_CODES,
  ERROR_STATUS,
  type ErrorCode,
  type ErrorDetail,
  type ErrorEnvelope,
} from "./errors.js";
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
  type JwkOkp,
  vJwkOkp,
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
} from "./validation.js";

export * from "./reservations.js";
export * from "./catalog.js";
export * from "./staff.js";
export * from "./admin.js";
export * from "./owner.js";
export * from "./sse.js";

import * as v from "./validation.js";

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
