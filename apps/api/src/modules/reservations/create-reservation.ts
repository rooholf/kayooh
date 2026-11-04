/**
 * POST /reservations  (SRS endpoint table + FR-INV-02)
 *
 * SKILL implement_zod_contract_route scope, executed here:
 *   1. .strict() request/response schemas from @repo/contracts
 *      (createReservationBodySchema / createReservationResponseSchema)
 *   2. the Fastify route in modules/reservations
 *   3. Zod failures -> 400 VALIDATION_ERROR with SRS 3.2 details[] (the
 *      envelope serialization lives in app.ts's error handler).
 *
 * Cross-cutting requirements handled by app.ts's shared middleware (NEG-6):
 *   - `Idempotency-Key` (SRS 3.2): REQUIRED on this route — reserve/replay/
 *     24 h window/reuse/in-progress semantics in lib/idempotency.ts, with the
 *     route listed in IDEMPOTENCY_ROUTES in app.ts.
 *   - auth: principal resolution + renter session (Better Auth, G-02/A-17).
 *
 * Not in this skill (separate skills, wired through seams):
 *   - build_transactional_inventory_lock: the FR-INV-02 hold transaction
 *     (FOR UPDATE on outlet_categories, computeAvailability, quote(),
 *     inserts, outbox) — see ./service.ts.
 *   - Xendit createInvoice + BullMQ release-hold enqueue (post-commit legs).
 */
import type { FastifyInstance } from "fastify";
import {
  createReservationBodySchema,
  createReservationResponseSchema,
  type CreateReservationResponse,
} from "@repo/contracts";
import { db } from "@repo/db";
import { AppError, validationError } from "../../lib/errors.js";
import type { Principal } from "../identity/guards.js";
import { hold as createReservationHold } from "./service.js";

/** FR-ID-02: renter-role endpoint (section 1.3 permission matrix). */
function renterOnly(principal: Principal | undefined): Principal {
  if (!principal) throw new AppError("UNAUTHENTICATED", "Sign in to create a reservation.");
  if (principal.role !== "renter") throw new AppError("FORBIDDEN");
  return principal;
}

export function registerReservationRoutes(app: FastifyInstance): void {
  app.post<{ Body: unknown }>("/api/v1/reservations", async (request, reply) => {
    const principal = renterOnly(request.principal);

    // --- Skill steps 1+3: .strict() body schema -> 400 VALIDATION_ERROR
    const body = createReservationBodySchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error);

    // --- FR-INV-02 business transaction (separate skill) ---------------
    const response = await createReservationHold(db, body.data, principal);

    // --- Skill step 1, response side: contract check on the way out ----
    const checked: CreateReservationResponse = createReservationResponseSchema.parse(response);

    // The idempotency plugin stores the 2xx response (24 h replay, SRS 3.2).
    reply.status(201).send(checked);
    return reply;
  });
}
