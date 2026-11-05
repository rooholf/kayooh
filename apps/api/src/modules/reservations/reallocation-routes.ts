/**
 * Renter reallocation routes (FR-INV-04.4-6):
 *   GET  /api/v1/reservations/:id/alternatives
 *   POST /api/v1/reservations/:id/reallocate            (Idempotency-Key)
 *   POST /api/v1/reservations/:id/decline-reallocation
 *
 * Resources elsewhere in the caller's scope 404 (SRS 3.2): a renter may only
 * act on their own reservation.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "@repo/db";
import { vUuid } from "@repo/contracts";
import { db, renters, reservations } from "@repo/db";
import { AppError, validationError } from "../../lib/errors.js";
import type { Principal } from "../identity/guards.js";
import { requireRole } from "../identity/guards.js";
import { z } from "zod";
import { acceptReallocation, declineReallocation, listAlternatives, type Alternative } from "../reallocation/index.js";

const targetBodySchema = z.object({ outletId: vUuid }).strict();

function renterOnly(request: FastifyRequest): Principal {
  const principal: Principal | undefined = request.principal;
  if (!principal) throw new AppError("UNAUTHENTICATED");
  if (principal.role !== "renter") throw new AppError("FORBIDDEN");
  return principal;
}

/** Loads the reservation and asserts the caller is the reserving renter. */
async function ownRenterReservation(reservationId: string, renterUserId: string) {
  const resRows = await db.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
  const reservation = resRows[0];
  if (!reservation) throw new AppError("NOT_FOUND", "Reservation does not exist.");
  const renterRows = await db.select({ userId: renters.userId }).from(renters).where(eq(renters.id, reservation.renterId)).limit(1);
  if (renterRows[0]?.userId !== renterUserId) {
    // Outside the caller's scope -> not found (SRS 3.2).
    throw new AppError("NOT_FOUND", "Reservation does not exist.");
  }
  return reservation;
}

export function registerReallocationRoutes(app: FastifyInstance): void {
  app.get("/api/v1/reservations/:id/alternatives", { preHandler: requireRole("renter") }, async (request, reply) => {
    const principal = renterOnly(request);
    const params = z.object({ id: vUuid }).safeParse(request.params);
    if (!params.success) throw validationError(params.error);
    const reservation = await ownRenterReservation(params.data.id, principal.userId);
    const alternatives: Alternative[] = await listAlternatives(
      db,
      { startsAt: reservation.startsAt, endsAt: reservation.endsAt },
      reservation.category,
      reservation.outletId,
    );
    void reply;
    return { reservationId: reservation.id, alternatives };
  });

  app.post("/api/v1/reservations/:id/reallocate", { preHandler: requireRole("renter") }, async (request, reply) => {
    const principal = renterOnly(request);
    const params = z.object({ id: vUuid }).safeParse(request.params);
    if (!params.success) throw validationError(params.error);
    const body = targetBodySchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error);
    const reservation = await ownRenterReservation(params.data.id, principal.userId);
    const response = await acceptReallocation(db, reservation.id, body.data.outletId);
    return reply.code(200).send(response);
  });

  app.post("/api/v1/reservations/:id/decline-reallocation", { preHandler: requireRole("renter") }, async (request, reply) => {
    const principal = renterOnly(request);
    const params = z.object({ id: vUuid }).safeParse(request.params);
    if (!params.success) throw validationError(params.error);
    const reservation = await ownRenterReservation(params.data.id, principal.userId);
    await declineReallocation(db, reservation.id);
    return reply.code(200).send({ reservationId: reservation.id });
  });
}
