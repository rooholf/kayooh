/**
 * Staff event routes (SRS 3.5 endpoint table, FR-OFF-01).
 *
 *   POST /api/v1/staff/events        — single event; 200 applied / 409
 *                                      SCAN_FLAGGED {reason} / 400-422 rejected.
 *   POST /api/v1/staff/events/batch  — ≤ 50 events; 200 with per-item
 *                                      {clientEventId, status, reason?}.
 *
 * Offline semantics (ordering, retries, duplicate/no-op) are decided SERVER
 * side: the batch is processed in ascending occurredAt regardless of the
 * arrival order, and `occurredAt` — not receivedAt — drives time rules.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ERROR_STATUS,
  healthSyncSchema,
  staffEventBatchSchema,
  staffEventEnvelopeSchema,
} from "@repo/contracts";
import { db } from "@repo/db";
import { AppError, validationError } from "../../lib/errors.js";
import type { Principal } from "../identity/guards.js";
import { requireRole } from "../identity/guards.js";
import { applyStaffEvent, applyStaffEvents, type ScanVerdict, type StaffContext } from "./events.js";
import { runHealthSync } from "./health-sync.js";

/** FR-ID-02.4: staff-role endpoint; staff operate from their own outlet. */
function staffContext(request: FastifyRequest): StaffContext {
  const principal: Principal | undefined = request.principal;
  if (!principal) throw new AppError("UNAUTHENTICATED");
  if (principal.role !== "staff") throw new AppError("FORBIDDEN");
  if (!principal.outletId) {
    throw new AppError("STATE_CONFLICT", "Staff account has no outlet assigned.");
  }
  return { staffOutletId: principal.outletId, staffUserId: principal.userId };
}

function respondVerdict(reply: FastifyReply, verdict: ScanVerdict): FastifyReply {
  if (verdict.status === "applied") {
    return reply.code(200).send({ clientEventId: verdict.clientEventId, status: verdict.status });
  }
  if (verdict.status === "flagged") {
    // FR-OFF-01.4: flagged -> 409 SCAN_FLAGGED with the reason.
    return reply.code(409).send({
      error: {
        code: "SCAN_FLAGGED",
        message: verdict.reason ?? "flagged",
        reason: verdict.reason,
        requestId: reply.request.id,
      },
    });
  }
  // rejected: 400/422/404 by reason class (SRS FR-OFF-01.3); the HTTP status
  // comes from the canonical ERROR_STATUS table (VOUCHER_* -> 422 etc.).
  const REJECTED_CODES = ["NOT_FOUND", "VOUCHER_INVALID", "VOUCHER_EXPIRED", "VALIDATION_ERROR"] as const;
  type RejectedCode = (typeof REJECTED_CODES)[number];
  const code: RejectedCode = (REJECTED_CODES as readonly string[]).includes(verdict.reason ?? "")
    ? (verdict.reason as RejectedCode)
    : "VALIDATION_ERROR";
  return reply.code(ERROR_STATUS[code]).send({
    error: {
      code,
      message: verdict.reason ?? "rejected",
      reason: verdict.reason,
      requestId: reply.request.id,
    },
  });
}

export function registerStaffRoutes(app: FastifyInstance): void {
  app.post("/api/v1/staff/events", { preHandler: requireRole("staff") }, async (request, reply) => {
    const parsed = staffEventEnvelopeSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    const ctx = staffContext(request);
    const verdict = await applyStaffEvent(db, parsed.data, ctx);
    return respondVerdict(reply, verdict);
  });

  app.post("/api/v1/staff/events/batch", { preHandler: requireRole("staff") }, async (request, reply) => {
    const parsed = staffEventBatchSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    const ctx = staffContext(request);
    // Ascending occurredAt application happens INSIDE the service call.
    const results = await applyStaffEvents(db, parsed.data.events, ctx);
    return reply.code(200).send({ results });
  });

  app.post("/api/v1/staff/health-sync", { preHandler: requireRole("staff") }, async (request, reply) => {
    const parsed = healthSyncSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    const ctx = staffContext(request);
    const result = await runHealthSync({
      sentAt: parsed.data.sentAt,
      physicalCounts: parsed.data.physicalCounts,
      staffOutletId: ctx.staffOutletId,
      staffUserId: ctx.staffUserId,
    });
    return reply.code(200).send(result);
  });
}
