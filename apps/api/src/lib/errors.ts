/**
 * Error envelope + application error type (SRS 3.2, 3.3).
 * All non-2xx responses are exactly:
 *   { error: { code, message, details?, requestId } }
 */
import type { ErrorCode, ErrorDetail } from "@repo/contracts";
import { ERROR_STATUS } from "@repo/contracts";
import { ZodError } from "zod";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: ErrorDetail[];
  private readonly statusOverride?: number;

  constructor(code: ErrorCode, message?: string, details?: ErrorDetail[], statusOverride?: number) {
    super(message ?? code);
    this.name = "AppError";
    this.code = code;
    this.details = details;
    this.statusOverride = statusOverride;
  }

  get status(): number {
    // NFR-02: e.g. INTERNAL can be surfaced as 503 for lock contention.
    return this.statusOverride ?? ERROR_STATUS[this.code];
  }
}

/** Map a ZodError to the SRS details array ([].path / [].issue). */
export function zodToDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((i) => ({
    path: i.path.map(String).join("."),
    issue: i.message,
  }));
}

/**
 * Build the 400 VALIDATION_ERROR payload for a schema failure
 * (SKILL implement_zod_contract_route step 3).
 */
export function validationError(error: ZodError): AppError {
  return new AppError("VALIDATION_ERROR", "Request failed schema validation.", zodToDetails(error));
}

/**
 * Send any AppError as the canonical error envelope (SRS 3.2), then rethrow so
 * Fastify's error hook does the actual serialization once, at the boundary.
 * (Call sites just `throw` — this helper only normalizes foreign errors.)
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return validationError(error);
  return new AppError("INTERNAL", "Unexpected server error.");
}
