/**
 * SSE streams (FR-REP-02).
 *
 *   GET /api/v1/outlets/stream — public, anonymous: `availability`
 *     {outletId, category, availableNow} events, delivered via the Redis
 *     pub/sub bridge (modules/sse/bus.ts) within 2 s of the commit that
 *     changed it (NFR-01). Heartbeat comment every 25 s.
 *
 *   GET /api/v1/owner/stream — owner session required (401 otherwise):
 *     `rental` and `bike_state` events, filtered server-side to the caller's
 *     owner_id through per-owner Redis channels. The handler never polls the
 *     database (skill directive): all delivery is push.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "@repo/db";
import { vCategoryCode, vTs, vUuid } from "@repo/contracts";
import { AppError, validationError } from "../../lib/errors.js";
import { computeAvailability } from "../inventory/availability.js";
import { requireRole, type Principal } from "../identity/guards.js";
import { subscribeOwner, subscribePublic, type OwnerEvent } from "./bus.js";

const STREAM_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  // Browsers are fine without it; it stops reverse proxies from buffering.
  "X-Accel-Buffering": "no",
} as const;

const HEARTBEAT_MS = 25_000;

type EmittedEvent = { type: string } & Record<string, unknown>;

/**
 * Wire one SSE connection: headers, heartbeats and teardown. `attach` is
 * given an emit callback and returns its unsubscribe. The subscription must
 * exist before the first producer commit so events arriving within 2 s of a
 * successful request are already routable (NFR-01).
 */
function streamEvents(
  request: FastifyRequest,
  reply: FastifyReply,
  attach: (emit: (event: EmittedEvent) => void) => () => void,
): Promise<void> {
  const raw = reply.raw;
  raw.writeHead(200, STREAM_HEADERS);

  let open = true;
  let detach: () => void = () => undefined;

  const stop = (): void => {
    open = false;
    clearInterval(heartbeat);
    detach();
  };

  const emit = (event: EmittedEvent): void => {
    if (!open) return;
    try {
      raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    } catch {
      stop();
    }
  };

  const heartbeat = setInterval(() => {
    if (!open) return;
    try {
      raw.write(": heartbeat\n\n");
    } catch {
      stop();
    }
  }, HEARTBEAT_MS);

  detach = attach(emit);
  request.raw.on("close", stop);

  raw.write("retry: 3000\n\n"); // flush headers + reconnect hint
  return Promise.resolve();
}

export function registerSseRoutes(app: FastifyInstance): void {
  // Public, anonymous availability stream (FR-REP-02.1).
  //
  // Slot-mirroring (revision 1.2 conversion UX): a renter books a scheduled
  // window, so the stream accepts `outletId`, `category`, `startsAt`, `endsAt`
  // (all four; slot-aligned 15-min windows). With them, every commit trigger
  // for that offering recomputes availability FOR THE RENTER'S CHOSEN WINDOW
  // and emits it — push-on-trigger, never a poll loop. Without a query the
  // stream broadcasts the raw SRS `availability` {…, availableNow} events for
  // every offering (instant window semantics).
  const slotQuerySchema = z
    .object({
      outletId: vUuid,
      category: vCategoryCode,
      startsAt: vTs,
      endsAt: vTs,
    })
    .strict();

  app.get("/api/v1/outlets/stream", async (request: FastifyRequest, reply: FastifyReply) => {
    const rawQuery = request.query as Record<string, string | undefined>;
    const slotParse = slotQuerySchema.safeParse(
      rawQuery.outletId
        ? {
            outletId: rawQuery.outletId,
            category: rawQuery.category,
            startsAt: rawQuery.startsAt,
            endsAt: rawQuery.endsAt,
          }
        : {},
    );
    // Partial slot query = a client bug; reject before opening the stream.
    if (rawQuery.outletId || rawQuery.startsAt || rawQuery.endsAt || rawQuery.category) {
      if (!slotParse.success) throw validationError(slotParse.error);
    }
    const slot = slotParse.success ? (slotParse.data as z.infer<typeof slotQuerySchema> | null) : null;
    if (slot) {
      const s = new Date(slot.startsAt);
      const e = new Date(slot.endsAt);
      // Whole 15-min slots only (V-SLOT, FR-INV-02 alignment rules).
      if (e.getTime() <= s.getTime() || s.getTime() % 900_000 !== 0 || (e.getTime() - s.getTime()) % 900_000 !== 0) {
        throw new AppError("VALIDATION_ERROR", "startsAt/endsAt must be aligned 15-minute slots with endsAt > startsAt.");
      }
      if (e.getTime() - s.getTime() > 7 * 24 * 3_600_000) {
        throw new AppError("VALIDATION_ERROR", "Stream window must not exceed 7 days.");
      }
    }

    await streamEvents(request, reply, (emit) =>
      subscribePublic((event) => {
        if (slot) {
          if (event.type !== "availability" || event.outletId !== slot.outletId || event.category !== slot.category) {
            return;
          }
          void computeAvailability(db, {
            outletId: slot.outletId,
            category: slot.category,
            startsAt: new Date(slot.startsAt),
            endsAt: new Date(slot.endsAt),
          })
            .then((count) => {
              emit({
                type: event.type,
                outletId: event.outletId,
                category: event.category,
                availableNow: count,
                window: { startsAt: slot.startsAt, endsAt: slot.endsAt },
              });
            })
            .catch(() => undefined); // a failed recompute drops the frame, the stream stays alive
          return;
        }
        emit(event);
      }),
    );
    return reply; // held open by the raw socket; the heartbeat marks liveness
  });

  // Owner-scoped stream (FR-REP-02.2). 401 without a session — and without
  // an owner binding: a principal must carry its owner_id to own a stream.
  app.get(
    "/api/v1/owner/stream",
    { preHandler: requireRole("owner") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const principal: Principal | undefined = request.principal;
      if (!principal?.ownerId) throw new AppError("UNAUTHENTICATED", "Owner session without an owner binding.");

      await streamEvents(request, reply, (emit) =>
        subscribeOwner(principal.ownerId!, (event: OwnerEvent) => emit(event)),
      );
      return reply;
    },
  );
}
