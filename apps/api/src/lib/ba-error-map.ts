/**
 * Mapping from Better Auth error payloads to the SRS error envelope (3.2/3.3).
 * Applied to every non-2xx /api/auth/* response.
 */
import type { ErrorCode } from "@repo/contracts";

/** BA error code name -> SRS code. Unlisted codes fall through to statusMap. */
const BA_CODE_MAP: Record<string, ErrorCode> = {
  INVALID_OTP: "OTP_INVALID",
  OTP_EXPIRED: "OTP_INVALID",
  OTP_NOT_FOUND: "OTP_INVALID",
  TOO_MANY_ATTEMPTS: "OTP_INVALID", // attempts exhausted = invalidated (FR-ID-01.5)
  INVALID_PHONE_NUMBER: "VALIDATION_ERROR",
  PHONE_NUMBER_EXIST: "DUPLICATE_RESOURCE",
  INVALID_EMAIL_OR_PASSWORD: "UNAUTHENTICATED",
  USER_NOT_FOUND: "UNAUTHENTICATED",
  USER_ALREADY_EXISTS: "DUPLICATE_RESOURCE",
  USER_BANNED: "FORBIDDEN",
  PASSWORD_TOO_SHORT: "VALIDATION_ERROR",
  PASSWORD_TOO_LONG: "VALIDATION_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
};

const STATUS_MAP: Record<number, ErrorCode> = {
  400: "VALIDATION_ERROR",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "STATE_CONFLICT",
  422: "VALIDATION_ERROR",
  429: "RATE_LIMITED",
  500: "INTERNAL",
};

export function mapAuthError(body: { message?: string; code?: string }, status: number): ErrorCode {
  const baCode = body.code ?? body.message ?? "";
  const mapped = BA_CODE_MAP[baCode];
  if (mapped) return mapped;
  return STATUS_MAP[status] ?? "INTERNAL";
}
