/**
 * Config key registry mirror (PATCH /api/v1/admin/config).
 *
 * The API's authoritative registry lives in
 * `apps/api/src/modules/app-config/index.ts` (`configSchemas`); there is no
 * read endpoint for it yet, so the konfigurasi form carries this mirror of
 * the key names and their value types. Keep both lists in sync — a key
 * missing here is still accepted by the API via "kunci lain…" input.
 */
export const CONFIG_KEYS: ReadonlyArray<{ key: string; type: string }> = [
  { key: "hold.checkout_minutes", type: "bilangan bulat > 0" },
  { key: "noshow.grace_minutes", type: "bilangan bulat ≥ 0" },
  { key: "commission.default_rate_bps", type: "bilangan bulat 0–10000" },
  { key: "commission.default_base", type: `"pre_discount" | "post_discount"` },
  { key: "promo.owner_share_bps", type: "bilangan bulat 0–10000" },
  { key: "late.owner_share_bps", type: "bilangan bulat 0–10000" },
  { key: "payout.min_idr", type: "bilangan bulat ≥ 0 (rupiah)" },
  { key: "dispute.raise_window_days", type: "bilangan bulat > 0" },
  { key: "dispute.resolve_business_days", type: "bilangan bulat > 0" },
  { key: "sync.interval_minutes", type: "bilangan bulat > 0" },
  { key: "sync.drift_max_pct", type: "bilangan ≥ 0" },
  { key: "pricing.billing_unit_minutes", type: "bilangan bulat > 0" },
  { key: "booking.slot_minutes", type: "bilangan bulat > 0" },
  { key: "booking.min_duration_minutes", type: "bilangan bulat > 0" },
  { key: "booking.max_duration_minutes", type: "bilangan bulat > 0" },
  { key: "booking.max_advance_days", type: "bilangan bulat ≥ 0" },
  { key: "booking.min_lead_minutes", type: "bilangan bulat ≥ 0" },
  { key: "booking.max_quantity", type: "bilangan bulat > 0" },
  { key: "booking.max_active_reservations_per_phone", type: "bilangan bulat > 0" },
  { key: "booking.dp_rate_bps", type: "bilangan bulat 0–10000" },
  { key: "checkout.early_minutes", type: "bilangan bulat ≥ 0" },
  { key: "late.grace_minutes", type: "bilangan bulat ≥ 0" },
  { key: "late.fee_per_30min_idr", type: "bilangan bulat ≥ 0 (rupiah)" },
  { key: "late.collection_method", type: `"payment_intent" | "offline_cash"` },
  {
    key: "late.escalation_minutes",
    type: `objek {"reminder","staff_call","owner_flag","claim_eligible"}`,
  },
  { key: "claims.owner_share_bps", type: "bilangan bulat 0–10000" },
  { key: "condition.min_photos", type: "bilangan bulat > 0" },
  { key: "condition.max_photos", type: "bilangan bulat > 0" },
  { key: "qr.voucher_ttl_seconds", type: "bilangan bulat > 0" },
  { key: "reallocation.response_minutes", type: "bilangan bulat > 0" },
  { key: "payments.min_charge_idr", type: "bilangan bulat > 0" },
  { key: "noshow.refund_policy", type: `"full_refund" | "retain_full"` },
  { key: "idv.retention_days", type: "bilangan bulat > 0" },
  { key: "reports.repeat_fault_threshold", type: "bilangan bulat > 0" },
  { key: "reports.window_days", type: "bilangan bulat > 0" },
  { key: "holidays", type: `array ["YYYY-MM-DD", …]` },
  { key: "feature.sister_outlets_enabled", type: "true | false" },
];

/**
 * Parse the value field: numbers stay numbers, true/false booleans,
 * anything JSON-shaped parses, otherwise the raw string goes through
 * (the API type-checks the value against the key's schema and answers
 * 400 VALIDATION_ERROR on a mismatch).
 */
export function parseConfigValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through: send the raw string and let the API answer 400.
    }
  }
  return trimmed;
}
