/* Error code catalog (SRS section 3.3). */
export const ERROR_CODES = [
  // 400
  "VALIDATION_ERROR",
  // 401
  "UNAUTHENTICATED",
  "OTP_INVALID",
  "WEBHOOK_SIGNATURE_INVALID",
  // 403
  "FORBIDDEN",
  // 404
  "NOT_FOUND",
  // 409
  "SOLD_OUT",
  "STATE_CONFLICT",
  "DUPLICATE_RESOURCE",
  "IDEMPOTENCY_IN_PROGRESS",
  "SCAN_FLAGGED",
  "MULTI_OUTLET_DISABLED",
  // 422
  "OUTSIDE_OPENING_HOURS",
  "DURATION_OUT_OF_RANGE",
  "WINDOW_OUT_OF_RANGE",
  "CATEGORY_NOT_OFFERED",
  "PROMO_INVALID",
  "AMOUNT_BELOW_MINIMUM",
  "VOUCHER_INVALID",
  "VOUCHER_EXPIRED",
  "IDEMPOTENCY_KEY_REUSED",
  "DISPUTE_WINDOW_CLOSED",
  // 429
  "RATE_LIMITED",
  // 500/502/503
  "INTERNAL",
  "GATEWAY_UNAVAILABLE",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  OTP_INVALID: 401,
  WEBHOOK_SIGNATURE_INVALID: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SOLD_OUT: 409,
  STATE_CONFLICT: 409,
  DUPLICATE_RESOURCE: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
  SCAN_FLAGGED: 409,
  MULTI_OUTLET_DISABLED: 409,
  OUTSIDE_OPENING_HOURS: 422,
  DURATION_OUT_OF_RANGE: 422,
  WINDOW_OUT_OF_RANGE: 422,
  CATEGORY_NOT_OFFERED: 422,
  PROMO_INVALID: 422,
  AMOUNT_BELOW_MINIMUM: 422,
  VOUCHER_INVALID: 422,
  VOUCHER_EXPIRED: 422,
  IDEMPOTENCY_KEY_REUSED: 422,
  DISPUTE_WINDOW_CLOSED: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  GATEWAY_UNAVAILABLE: 502,
};

/** Error details entry (SRS section 3.2: details?[].{path, issue}). */
export interface ErrorDetail {
  path: string;
  issue: string;
}

/**
 * Error envelope for every non-2xx response (SRS section 3.2):
 * { error: { code, message, details?, requestId } }
 */
export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
    requestId: string;
  };
}
