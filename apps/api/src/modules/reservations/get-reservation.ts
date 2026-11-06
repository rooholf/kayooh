/**
 * Renter reservation read routes (SRS 7.1 endpoint table + A-18):
 *   GET /reservations
 *   GET /reservations/{id}
 *   GET /reservations/{id}/voucher   (FR-SEC-01.1)
 *
 * Access (A-18): an owning renter session, OR a reservation-scoped signed
 * `guestToken` supplied as `Authorization: Bearer <guestToken>`. A guest token
 * grants a single reservation only — never a list — so per-reservation reads
 * are restricted to the exact id it was minted for. Anything outside the
 * caller's scope returns 404 (SRS 3.2: never leak existence).
 *
 * Renter responses expose counts only — no bike ids or asset tags (NEG-2).
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, desc, eq, lt, or } from "@repo/db";
import { db, renters, reservations } from "@repo/db";
import {
  listReservationsQuerySchema,
  reservationListResponseSchema,
  reservationResourceSchema,
  voucherResponseSchema,
  vUuid,
  type ReservationListResponse,
  type ReservationResource,
  type VoucherResponse,
} from "@repo/contracts";
import { AppError, validationError } from "../../lib/errors.js";
import { verifyGuestToken } from "../../lib/guest-token.js";
import { signVoucher } from "../../lib/voucher.js";
import { getConfig } from "../app-config/index.js";

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

interface ReservationRow {
  id: string;
  outletId: string;
  category: string;
  quantity: number;
  startsAt: Date;
  endsAt: Date;
  status: string;
  expiresAt: Date | null;
  priceIdr: bigint;
  discountIdr: bigint;
  finalIdr: bigint;
  dpIdr: bigint;
  atRisk: boolean;
}

function toResource(row: ReservationRow): ReservationResource {
  return reservationResourceSchema.parse({
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
}

/* ------------------------------------------------------------------ */
/* Cursor pagination (SRS 3.2: order created_at DESC, id DESC)         */
/* ------------------------------------------------------------------ */

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  let raw: string;
  try {
    raw = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid cursor.", [{ path: "cursor", issue: "invalid" }]);
  }
  const sep = raw.indexOf("|");
  const createdAt = sep < 0 ? new Date(Number.NaN) : new Date(raw.slice(0, sep));
  const id = sep < 0 ? "" : raw.slice(sep + 1);
  if (Number.isNaN(createdAt.getTime()) || !vUuid.safeParse(id).success) {
    throw new AppError("VALIDATION_ERROR", "Invalid cursor.", [{ path: "cursor", issue: "invalid" }]);
  }
  return { createdAt, id };
}

/** Resolve the caller's own `renters` row id, or undefined when unlinked. */
async function ownRenterId(userId: string): Promise<string | undefined> {
  const rows = await db.select({ id: renters.id }).from(renters).where(eq(renters.userId, userId)).limit(1);
  return rows[0]?.id;
}

export function registerReservationReadRoutes(app: FastifyInstance): void {
  /* -------------------- GET /reservations (own list) ------------------- */
  app.get<{ Querystring: unknown }>("/api/v1/reservations", async (request, reply) => {
    const principal = request.principal;
    if (!principal) throw new AppError("UNAUTHENTICATED");
    if (principal.role !== "renter") throw new AppError("FORBIDDEN");

    const query = listReservationsQuerySchema.safeParse(request.query);
    if (!query.success) throw validationError(query.error);
    const { status, limit, cursor } = query.data;

    // A guest has no list (A-18); an authenticated renter with no linked row
    // simply has no reservations yet.
    const renterId = await ownRenterId(principal.userId);
    if (!renterId) {
      const empty: ReservationListResponse = { data: [], nextCursor: null };
      return reply.code(200).send(empty);
    }

    const conditions = [eq(reservations.renterId, renterId)];
    if (status !== undefined) conditions.push(eq(reservations.status, status));
    if (cursor !== undefined) {
      const { createdAt, id } = decodeCursor(cursor);
      const after = or(
        lt(reservations.createdAt, createdAt),
        and(eq(reservations.createdAt, createdAt), lt(reservations.id, id)),
      );
      if (after) conditions.push(after);
    }

    const rows = await db
      .select({
        id: reservations.id,
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
        createdAt: reservations.createdAt,
      })
      .from(reservations)
      .where(and(...conditions))
      .orderBy(desc(reservations.createdAt), desc(reservations.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

    const response: ReservationListResponse = reservationListResponseSchema.parse({
      data: page.map(toResource),
      nextCursor,
    });

    return reply.code(200).send(response);
  });

  /* -------------------- GET /reservations/{id} ------------------------- */
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

    return reply.code(200).send(toResource(row));
  });

  /* --------------- GET /reservations/{id}/voucher (FR-SEC-01.1) -------- */
  app.get<{ Params: unknown }>("/api/v1/reservations/:id/voucher", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) throw validationError(params.error);
    const reservationId = params.data.id;

    const principal = request.principal;
    if (principal && principal.role !== "renter") throw new AppError("FORBIDDEN");

    if (!principal) {
      const verdict = verifyGuestToken(bearerToken(request));
      if (!verdict.ok) {
        throw new AppError("UNAUTHENTICATED", "A guest token is required to view this voucher.");
      }
      if (verdict.reservationId !== reservationId) {
        throw new AppError("NOT_FOUND", "Reservation does not exist.");
      }
    }

    const rows = await db
      .select({ id: reservations.id, renterId: reservations.renterId, status: reservations.status })
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
        throw new AppError("NOT_FOUND", "Reservation does not exist.");
      }
    }

    // The QR is meaningful only once the down payment confirmed the booking.
    if (row.status !== "confirmed") {
      throw new AppError("STATE_CONFLICT", "A voucher is available only after the reservation is confirmed.");
    }

    const ttlSeconds = await getConfig("qr.voucher_ttl_seconds");
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const response: VoucherResponse = voucherResponseSchema.parse({
      token: signVoucher({ reservationId: row.id, expiresAt }),
      expiresAt: iso(expiresAt),
    });

    return reply.code(200).send(response);
  });
}
