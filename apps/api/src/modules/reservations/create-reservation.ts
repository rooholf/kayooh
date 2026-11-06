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
 * Revision 1.2 (guest checkout, NEW-C / A-17): this route is PUBLIC. A session
 * is optional — an authenticated renter keeps the original path (session wins),
 * while an unauthenticated checkout is a guest booking keyed by `contactPhone`:
 *   - `contactPhone` REQUIRED (400) when unauthenticated, REJECTED (400) when a
 *     session is present (the session already identifies the renter).
 *   - `promoCode` without a session -> 401 UNAUTHENTICATED (promotions are an
 *     account feature).
 *
 * Cross-cutting requirements handled by app.ts's shared middleware (NEG-6):
 *   - `Idempotency-Key` (SRS 3.2): REQUIRED on this route — reserve/replay/
 *     24 h window/reuse/in-progress semantics in lib/idempotency.ts, keyed by
 *     `userId` for renters and by `contactPhone` for guests.
 *   - auth: principal resolution + optional renter session (Better Auth).
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
  type CreateReservationBody,
  type CreateReservationResponse,
} from "@repo/contracts";
import { db } from "@repo/db";
import { AppError, validationError } from "../../lib/errors.js";
import type { ReservationActor } from "../inventory/index.js";
import { hold as createReservationHold } from "./service.js";

/**
 * Resolve the booking identity (revision 1.2). A session wins: it must be a
 * renter and must NOT carry `contactPhone`. Otherwise this is a guest booking
 * and `contactPhone` is required; `promoCode` is refused without a session.
 */
function resolveActor(body: CreateReservationBody, principal: { userId: string; role: string } | undefined): ReservationActor {
  if (principal) {
    if (principal.role !== "renter") throw new AppError("FORBIDDEN");
    if (body.contactPhone !== undefined) {
      throw new AppError("VALIDATION_ERROR", "contactPhone must be omitted for an authenticated renter.", [
        { path: "contactPhone", issue: "forbidden for authenticated requests" },
      ]);
    }
    return { kind: "renter", userId: principal.userId };
  }
  if (body.promoCode !== undefined) {
    throw new AppError("UNAUTHENTICATED", "Promotions require an account; sign in to apply a promo code.");
  }
  if (body.contactPhone === undefined) {
    throw new AppError("VALIDATION_ERROR", "contactPhone is required for a guest reservation.", [
      { path: "contactPhone", issue: "required" },
    ]);
  }
  // vPhone already normalized the value during parsing (08xx/628xx -> +628xx).
  return { kind: "guest", phone: body.contactPhone };
}

export function registerReservationRoutes(app: FastifyInstance): void {
  app.post<{ Body: unknown }>("/api/v1/reservations", async (request, reply) => {
    // --- Skill steps 1+3: .strict() body schema -> 400 VALIDATION_ERROR
    const body = createReservationBodySchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error);

    const actor = resolveActor(body.data, request.principal);

    // --- FR-INV-02 business transaction (separate skill) ---------------
    const response = await createReservationHold(db, body.data, actor);

    // --- Skill step 1, response side: contract check on the way out ----
    const checked: CreateReservationResponse = createReservationResponseSchema.parse(response);

    // The idempotency plugin stores the 2xx response (24 h replay, SRS 3.2).
    reply.status(201).send(checked);
    return reply;
  });
}
