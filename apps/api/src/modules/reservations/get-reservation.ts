/**
 * GET /reservations/{id}  (SRS 7.1 endpoint table + A-18)
 *
 * Access (A-18): an owning renter session, OR a reservation-scoped signed
 * `guestToken` supplied as `Authorization: Bearer <guestToken>`. A guest token
 * grants this one reservation only — never a list — so the read is restricted
 * to the exact id it was minted for. Anything outside the caller's scope
 * returns 404 (SRS 3.2: never leak existence).
 *
 * Renter responses expose counts only — no bike ids or asset tags (NEG-2).
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq } from "@repo/db";
import { db, renters, reservations } from "@repo/db";
import {
  reservationResourceSchema,
  vUuid,
  type ReservationResource,
} from "@repo/contracts";
import { AppError, validationError } from "../../lib/errors.js";
import { verifyGuestToken } from "../../lib/guest-token.js";

const paramsSchema = z.object({ id: vUuid }).strict();

/** Extract a `Bearer <token>` credential from the Authorization header. */
function bearerToken(request: FastifyRequest): string | undefined {
  const raw = request.headers.authorization;
  if (typeof raw !== "string") return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match?.[1]?.trim();
}

const iso = (d: Date): string => d.toISOString(); // always ends in Z (SRS 3.1)
const idr = (v: bigint): number => Number(v); // exact for |v| < 2^53 (INV-5)

export function registerReservationReadRoutes(app: FastifyInstance): void {
  app.get<{ Params: unknown }>("/api/v1/reservations/:id", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) throw validationError(params.error);
    const reservationId = params.data.id;

    const principal = request.principal;
    if (principal && principal.role !== "renter") throw new AppError("FORBIDDEN");

    // Unauthenticated callers must present a guest token minted for THIS id.
    if (!principal) {
      const verdict = verifyGuestToken(bearerToken(request));
      if (!verdict.ok) {
        throw new AppError("UNAUTHENTICATED", "A guest token is required to view this reservation.");
      }
      if (verdict.reservationId !== reservationId) {
        throw new AppError("NOT_FOUND", "Reservation does not exist.");
      }
    }

    const rows = await db
      .select({
        id: reservations.id,
        renterId: reservations.renterId,
        outletId: reservations.outletId,
        category: reservations.category,
        quantity: reservations.quantity,
        startsAt: reservations.startsAt,
        endsAt: reservations.endsAt,
        status: reservations.status,
        expiresAt: reservations.expiresAt,
        priceIdr: reservations.priceIdr,
        discountIdr: reservations.discountIdr,
        finalIdr: reservations.finalIdr,
        dpIdr: reservations.dpIdr,
        atRisk: reservations.atRisk,
      })
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1);
    const row = rows[0];
    if (!row) throw new AppError("NOT_FOUND", "Reservation does not exist.");

    if (principal) {
      const renterRows = await db
        .select({ userId: renters.userId })
        .from(renters)
        .where(eq(renters.id, row.renterId))
        .limit(1);
      if (renterRows[0]?.userId !== principal.userId) {
        // Outside the caller's scope -> 404 (SRS 3.2).
        throw new AppError("NOT_FOUND", "Reservation does not exist.");
      }
    }

    const resource: ReservationResource = reservationResourceSchema.parse({
      id: row.id,
      outletId: row.outletId,
      category: row.category,
      quantity: row.quantity,
      startsAt: iso(row.startsAt),
      endsAt: iso(row.endsAt),
      status: row.status,
      expiresAt: row.expiresAt === null ? null : iso(row.expiresAt),
      priceIdr: idr(row.priceIdr),
      discountIdr: idr(row.discountIdr),
      finalIdr: idr(row.finalIdr),
      dpIdr: idr(row.dpIdr),
      atRisk: row.atRisk,
    });

    return reply.code(200).send(resource);
  });
}
