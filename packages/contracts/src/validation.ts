/**
 * Validation dictionary (SRS section 3.4, V-* rules).
 * Every rule is a pure function/Zod schema, reused by packages/contracts
 * route schemas AND by apps/api handlers (single source of truth).
 */
import { z } from "zod";

/* V-UUID: lowercase RFC 4122 UUID. */
export const vUuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    "V-UUID",
  );

/* V-TS: ISO 8601 UTC datetime ending in Z (non-UTC offsets rejected). */
export const vTs = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/, "V-TS");

/**
 * V-IDR: integer, 0 <= n <= 1_000_000_000.
 * INV-5: money is always an integer; no floats.
 */
export const vIdr = z.number().int().min(0).max(1_000_000_000);

/**
 * V-QTY: integer, 1 to `booking.max_quantity` (default 5, SRS section 4).
 * The number of bikes one reservation locks (FR-INV-02).
 */
export const vQty = z.number().int().min(1).max(5);

/* V-CAT: exists in categories.code; regex ^[a-z0-9_]{2,16}$ (existence checked
 * against the DB in the module layer, never here). */
export const vCategoryCode = z.string().regex(/^[a-z0-9_]{2,16}$/, "V-CAT");

/**
 * V-PHONE: normalize (08xx -> +628xx, 628xx -> +628xx) then must match
 * ^\+62[0-9]{8,13}$ (AC FR-ID-01: all three inputs normalize identically).
 */
export function normalizePhone(input: string): string {
  let s = input.trim();
  if (s.startsWith("0")) s = `+62${s.slice(1)}`;
  else if (s.startsWith("628")) s = `+${s}`;
  return s;
}

export function isValidNominalPhone(s: string): boolean {
  return /^\+62[0-9]{8,13}$/.test(s);
}

/* V-EMAIL: lowercased, 3-254 chars, valid address. */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export const vEmail = z
  .string()
  .transform(normalizeEmail)
  .pipe(
    z
      .string()
      .min(3)
      .max(254)
      .regex(
        /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/,
        "V-EMAIL",
      ),
  );

/* V-PHONE: zod pipeline variant of normalizePhone + isValidNominalPhone. */
export const vPhone = z
  .string()
  .transform(normalizePhone)
  .pipe(z.string().regex(/^\+62[0-9]{8,13}$/, "V-PHONE"));

/* V-PASSWORD: 12-128 characters. */
export const vPassword = z.string().min(12).max(128);

/* V-TEXT-S / V-TEXT-L. */
export const vTextS = z.string().trim().min(1).max(200);
export const vTextL = z.string().trim().min(10).max(2000);

/* V-LAT / V-LNG (only ever used for sorting; never persisted, NEG-4). */
export const vLat = z.number().min(-90).max(90);
export const vLng = z.number().min(-180).max(180);

/* V-ASSET-TAG: ^JMB-[0-9]{3}-[A-Z]{3}-[0-9]{3}$ */
export const vAssetTag = z.string().regex(/^JMB-[0-9]{3}-[A-Z]{3}-[0-9]{3}$/, "V-ASSET-TAG");

/* V-COLLATERAL: physical collateral collected at check-out (masked reference). */
export const vCollateral = z
  .object({
    type: z.enum(["ktp", "sim", "vehicle"]),
    reference: vTextS,
  })
  .strict();

/* V-JWK-OKP: one Ed25519 public-key entry of the voucher JWKS (FR-SEC-01.1).
   `x` is the 32-byte public key, base64url-encoded without padding (JWK).
   Public keys are bundled in the staff app for the offline pre-check; only
   the secret signing seed lives in server environment (FR-SEC-01.4). */
export const vJwkOkp = z
  .object({
    kid: z.string().min(1).max(64),
    kty: z.literal("OKP"),
    crv: z.literal("Ed25519"),
    x: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "V-JWK-OKP"),
  })
  .strict();
export type JwkOkp = z.infer<typeof vJwkOkp>;

/* V-HOURS: object keys mon..sun, each an array of 0-2 intervals {open,close}
   "HH:MM" (24 h, minutes multiples of 15), open < close, no overlaps. */
const vInterval = z
  .object({ open: z.string().regex(/^([01]\d|2[0-3]):[03]0$/, "V-HOURS"), close: z.string().regex(/^([01]\d|2[0-3]):[03]0$/, "V-HOURS") })
  .strict()
  .refine((v) => v.open < v.close, { message: "V-HOURS" });
export const vHours = z
  .object({
    mon: z.array(vInterval).max(2).optional().default([]),
    tue: z.array(vInterval).max(2).optional().default([]),
    wed: z.array(vInterval).max(2).optional().default([]),
    thu: z.array(vInterval).max(2).optional().default([]),
    fri: z.array(vInterval).max(2).optional().default([]),
    sat: z.array(vInterval).max(2).optional().default([]),
    sun: z.array(vInterval).max(2).optional().default([]),
  })
  .strict();

/* V-OUTLET-CODE: ^JMB-[0-9]{3}$ */
export const vOutletCode = z.string().regex(/^JMB-[0-9]{3}$/, "V-OUTLET-CODE");

/* V-PROMO: uppercased ^[A-Z0-9]{4,16}$ */
export const vPromo = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{4,16}$/, "V-PROMO"));

/* V-PHOTO-KEY: uploads/(checklist|damage|id)/<uuid>.jpg|png|webp */
export const vPhotoKey = z
  .string()
  .regex(
    /^uploads\/(checklist|damage|id)\/[0-9a-f-]{36}\.(jpg|png|webp)$/,
    "V-PHOTO-KEY",
  );

/* V-CLIENT-EVENT-ID: UUID v4. */
export const vClientEventId = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    "V-CLIENT-EVENT-ID",
  );

/* V-CHECKLIST: fixed six-item condition checklist (SRS 3.4 / A-02). */
export const vChecklistStatus = z.enum(["ok", "minor_issue", "damaged"]);

export const vChecklist = z
  .object({
    frame: vChecklistStatus,
    brakes: vChecklistStatus,
    tires: vChecklistStatus,
    chain: vChecklistStatus,
    saddle: vChecklistStatus,
    handlebar_gears: vChecklistStatus,
  })
  .strict();

/* V-DATE: calendar day `YYYY-MM-DD` (WIB dates in staff reads, reports). */
export const vDate = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "V-DATE");

/* V-LIMIT / V-CURSOR (list convention SRS 3.2). */
export const vLimit = z.coerce.number().int().min(1).max(100).default(25);
export const vCursor = z.string().max(256).optional();

/* V-WEEK: ISO week key ^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$ (settlements,
 * statements, payouts — SRS 3.4 / 7.4). */
export const vWeekKey = z.string().regex(/^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$/, "V-WEEK");

/* Idempotency-Key header (SRS 3.2): required on the marked POST routes. */
export const vIdempotencyKey = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    "Idempotency-Key",
  );
