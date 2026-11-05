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
  vChecklist,
  vChecklistStatus,
  vClientEventId,
  vCursor,
  vEmail,
  vIdempotencyKey,
  vIdr,
  vLat,
  vLng,
  vLimit,
  vOutletCode,
  vPassword,
  vPhone,
  vPhotoKey,
  vPromo,
  vTextL,
  vTextS,
  vTs,
  vUuid,
  isValidNominalPhone,
  normalizeEmail,
  normalizePhone,
} from "./validation";

export * from "./reservations";

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
export const weekKeySchema = z.string().regex(/^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$/);

export type Uuid = z.infer<typeof uuidSchema>;
export type Idr = z.infer<typeof idrSchema>;
export type CategoryCode = z.infer<typeof categoryCodeSchema>;
