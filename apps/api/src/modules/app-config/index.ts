/**
 * Config store (SRS section 4): table app_config, read through getConfig
 * with a 30 s in-process cache, changed only by admin (audit logged).
 * TBD values are business decisions — they live here, NEVER hard-coded in
 * business logic. FIXTURE values are for seed data and tests only.
 */
import { eq } from "@repo/db";
import { z } from "zod";
import { db } from "@repo/db";
import { appConfig } from "@repo/db";
import { recordAudit } from "../audit/index.js";

/* ------------------------------------------------------------------ */
/* Schema registry: value type-checking for PATCH /admin/config.       */
/* ------------------------------------------------------------------ */

const int = z.number().int();
const positiveInt = int.min(1);
const nonNegativeInt = int.min(0);

export const configSchemas = {
  "hold.checkout_minutes": positiveInt,
  "noshow.grace_minutes": nonNegativeInt,
  "commission.default_rate_bps": int.min(0).max(10000),
  "commission.default_base": z.enum(["pre_discount", "post_discount"]),
  "promo.owner_share_bps": int.min(0).max(10000),
  "late.owner_share_bps": int.min(0).max(10000),
  "payout.min_idr": nonNegativeInt,
  "dispute.raise_window_days": positiveInt,
  "dispute.resolve_business_days": positiveInt,
  "sync.interval_minutes": positiveInt,
  "sync.drift_max_pct": z.number().min(0),
  "pricing.billing_unit_minutes": positiveInt,
  "booking.slot_minutes": positiveInt,
  "booking.min_duration_minutes": positiveInt,
  "booking.max_duration_minutes": positiveInt,
  "booking.max_advance_days": nonNegativeInt,
  "booking.min_lead_minutes": nonNegativeInt,
  "checkout.early_minutes": nonNegativeInt,
  "late.grace_minutes": nonNegativeInt,
  "late.fee_per_started_hour_idr": nonNegativeInt,
  "late.collection_method": z.enum(["deposit_deduction", "payment_intent"]),
  "late.escalation_minutes": z.object({
    reminder: nonNegativeInt,
    staff_call: nonNegativeInt,
    owner_flag: nonNegativeInt,
    claim_eligible: nonNegativeInt,
  }),
  "deposit.amount_idr": nonNegativeInt,
  "deposit.auto_release_enabled": z.boolean(),
  "claims.owner_share_bps": int.min(0).max(10000),
  "condition.min_photos": positiveInt,
  "condition.max_photos": positiveInt,
  "qr.voucher_ttl_seconds": positiveInt,
  "reallocation.response_minutes": positiveInt,
  "payments.min_charge_idr": positiveInt,
  "noshow.refund_policy": z.enum(["full_refund", "retain_full"]),
  "idv.retention_days": positiveInt,
  "reports.repeat_fault_threshold": positiveInt,
  "reports.window_days": positiveInt,
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  "feature.sister_outlets_enabled": z.boolean(),
} as const satisfies Record<string, z.ZodTypeAny>;

export type ConfigKey = keyof typeof configSchemas;
export const CONFIG_KEYS = Object.keys(configSchemas) as ConfigKey[];

/* ------------------------------------------------------------------ */
/* Cache (30 s, in-process — SRS section 4).                           */
/* ------------------------------------------------------------------ */

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: unknown; fetchedAt: number }>();

export function invalidateConfigCache(): void {
  cache.clear();
}

/** Reads a config value with the 30 s in-process cache. Throws if key is unknown. */
export async function getConfig<K extends ConfigKey>(key: K): Promise<z.infer<(typeof configSchemas)[K]>> {
  if (!(key in configSchemas)) {
    throw new Error(`Unknown config key: ${key}`);
  }
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.value as z.infer<(typeof configSchemas)[K]>;
  }
  const rows = await db.select().from(appConfig).where(eq(appConfig.key, key)).limit(1);
  let value: unknown;
  const existing = rows[0];
  if (!existing) {
    value = await seedMissingConfig(key);
  } else {
    value = existing.value;
  }
  const parsed = (configSchemas[key] as z.ZodTypeAny).parse(value) as z.infer<(typeof configSchemas)[K]>;
  cache.set(key, { value: parsed, fetchedAt: now });
  return parsed;
}

/**
 * First read of a missing key resolves to the SRS section 4 default
 * (FIXTURE for TBD keys) and writes it down so drift is visible.
 */
async function seedMissingConfig(key: ConfigKey): Promise<unknown> {
  const fallback = CONFIG_DEFAULTS[key];
  await db
    .insert(appConfig)
    .values({ key, value: fallback, updatedBy: null })
    .onConflictDoNothing();
  return fallback;
}

/**
 * Section 4 values. FIXED = PRD-fixed; TBD = SRS FIXTURE (seed/tests only,
 * replaced by a business decision before launch — never hard-code elsewhere).
 */
export const CONFIG_DEFAULTS: Record<ConfigKey, unknown> = {
  "hold.checkout_minutes": 15,
  "noshow.grace_minutes": 60,
  "commission.default_rate_bps": 1800,
  "commission.default_base": "pre_discount",
  "promo.owner_share_bps": 5000,
  "late.owner_share_bps": 5000,
  "payout.min_idr": 100000,
  "dispute.raise_window_days": 7,
  "dispute.resolve_business_days": 3,
  "sync.interval_minutes": 5,
  "sync.drift_max_pct": 1,
  "pricing.billing_unit_minutes": 60,
  "booking.slot_minutes": 15,
  "booking.min_duration_minutes": 60,
  "booking.max_duration_minutes": 1440,
  "booking.max_advance_days": 7,
  "booking.min_lead_minutes": 0,
  "checkout.early_minutes": 0,
  "late.grace_minutes": 15,
  "late.fee_per_started_hour_idr": 10000,
  "late.collection_method": "deposit_deduction",
  "late.escalation_minutes": { reminder: 0, staff_call: 30, owner_flag: 60, claim_eligible: 240 },
  "deposit.amount_idr": 200000,
  "deposit.auto_release_enabled": false,
  "claims.owner_share_bps": 10000,
  "condition.min_photos": 1,
  "condition.max_photos": 8,
  "qr.voucher_ttl_seconds": 60,
  "reallocation.response_minutes": 30,
  "payments.min_charge_idr": 10000,
  "noshow.refund_policy": "full_refund",
  "idv.retention_days": 90,
  "reports.repeat_fault_threshold": 3,
  "reports.window_days": 90,
  holidays: [],
  "feature.sister_outlets_enabled": false,
};

/* ------------------------------------------------------------------ */
/* Mutation (admin only; callers enforce the role, this audits).       */
/* ------------------------------------------------------------------ */

export interface SetConfigInput {
  key: string;
  value: unknown;
  actorId: string;
  before?: unknown;
}

/** Validates and writes a config change; writes the audit trail (FR-SEC-02). */
export async function setConfig(input: SetConfigInput): Promise<{ key: ConfigKey; value: unknown }> {
  const key = input.key as ConfigKey;
  const schema = configSchemas[key];
  if (!schema) {
    const err = new Error(`Unknown config key: ${input.key}`);
    err.name = "UnknownConfigKey";
    throw err;
  }
  const value = schema.parse(input.value);
  await db
    .insert(appConfig)
    .values({ key, value, updatedBy: input.actorId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value, updatedBy: input.actorId, updatedAt: new Date() },
    });
  cache.delete(key);
  await recordAudit({
    actorId: input.actorId,
    actorRole: "admin",
    action: "config.change",
    entity: "app_config",
    entityId: null,
    before: input.before === undefined ? null : { key: input.key, value: input.before },
    after: { key, value },
  });
  return { key, value };
}
