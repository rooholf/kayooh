/**
 * Idempotency middleware (SRS 3.2 / `idempotency_keys` table).
 *
 * Contract on the REQUIRED-header routes (POST /reservations, POST
 * /reservations/{id}/reallocate):
 *  - same key + same body within 24 h -> stored response, header
 *    `Idempotent-Replay: true`
 *  - same key + different body -> 422 IDEMPOTENCY_KEY_REUSED
 *  - same key while the first request still runs -> 409 IDEMPOTENCY_IN_PROGRESS
 *
 * Storage row states: pending (no response yet) | completed (status+body).
 * A `pending` row older than the stall window is considered abandoned and is
 * reclaimed by a new request with the same key (crash recovery).
 */
import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq } from "@repo/db";
import { db } from "@repo/db";
import { idempotencyKeys } from "@repo/db";
import { AppError } from "./errors.js";
import type { Principal } from "../modules/identity/guards.js";

const STALL_WINDOW_MS = 30_000; // pending rows older than this are reclaimable
const REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000; // SRS: 24 h

export function hashRequest(input: { method: string; url: string; body: unknown }): string {
  return createHash("sha256")
    .update(input.method)
    .update(" ")
    .update(input.url)
    .update(" ")
    .update(JSON.stringify(input.body ?? null))
    .digest("hex");
}

interface Row {
  requestHash: string;
  response: unknown;
  statusCode: number | null;
  createdAt: Date;
}

async function findRow(key: string, userId: string): Promise<Row | undefined> {
  const rows = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return {
    requestHash: row.requestHash,
    response: row.response,
    statusCode: row.statusCode,
    createdAt: row.createdAt,
  };
}

interface IdempotencyMarker {
  key: string;
  userId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    idempotencyMarker?: IdempotencyMarker;
  }
}

export interface IdempotencyPluginOptions {
  /** Route registrations that require the header, e.g. { method: "POST", url: "/api/v1/reservations" }. */
  routes: Array<{ method: string; url: string }>;
  /** Resolve the authenticated principal (runs after session resolution). */
  getPrincipal(request: FastifyRequest): Principal | null;
}

export function registerIdempotency(app: FastifyInstance, options: IdempotencyPluginOptions): void {
  const routeIndex = new Set(options.routes.map((r) => `${r.method} ${r.url}`));

  app.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    const routeUrl = request.routeOptions?.url;
    if (!routeUrl || !routeIndex.has(`${request.method} ${routeUrl}`)) return;

    const header = request.headers["idempotency-key"];
    if (typeof header !== "string" || header.length === 0) {
      throw new AppError("VALIDATION_ERROR", "Idempotency-Key header is required", [
        { path: "headers.Idempotency-Key", issue: "required" },
      ]);
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(header)) {
      throw new AppError("VALIDATION_ERROR", "Idempotency-Key must be a lowercase UUID");
    }

    const principal = options.getPrincipal(request);
    if (!principal) throw new AppError("UNAUTHENTICATED");

    const requestHash = hashRequest({ method: request.method, url: routeUrl, body: request.body });

    const existing = await findRow(header, principal.userId);
    if (existing) {
      const age = Date.now() - existing.createdAt.getTime();
      if (existing.requestHash !== requestHash) {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", "Same Idempotency-Key with a different request body");
      }
      if (existing.statusCode !== null && existing.response !== null && age <= REPLAY_WINDOW_MS) {
        void reply.header("Idempotent-Replay", "true");
        void reply.code(existing.statusCode);
        return reply.send(existing.response);
      }
      if (existing.statusCode === null && age <= STALL_WINDOW_MS) {
        throw new AppError("IDEMPOTENCY_IN_PROGRESS", "A request with this Idempotency-Key is still in progress");
      }
      // Abandoned pending row (crash or stall): reclaim it.
      await db
        .update(idempotencyKeys)
        .set({ requestHash, response: null, statusCode: null, createdAt: new Date() })
        .where(and(eq(idempotencyKeys.key, header), eq(idempotencyKeys.userId, principal.userId)));
    } else {
      await db
        .insert(idempotencyKeys)
        .values({ key: header, userId: principal.userId, requestHash })
        .onConflictDoNothing();
    }

    request.idempotencyMarker = { key: header, userId: principal.userId };
  });

  // Single registration-time hook: persists the final response for replay.
  // Per the table's check constraint, ONLY 2xx responses are stored (replayed
  // for 24 h). A non-2xx terminal response releases the pending row so the
  // client may retry immediately with the same key.
  app.addHook("onSend", async (request: FastifyRequest, reply: FastifyReply, payload) => {
    const marker = request.idempotencyMarker;
    if (!marker) return payload;
    try {
      if (reply.statusCode >= 200 && reply.statusCode < 300) {
        const stored =
          typeof payload === "string" && payload.length > 0
            ? JSON.parse(payload)
            : payload instanceof Buffer
              ? JSON.parse(payload.toString("utf8"))
              : payload;
        await db
          .update(idempotencyKeys)
          .set({ response: stored ?? null, statusCode: reply.statusCode, createdAt: new Date() })
          .where(and(eq(idempotencyKeys.key, marker.key), eq(idempotencyKeys.userId, marker.userId)));
      } else {
        await db
          .delete(idempotencyKeys)
          .where(and(eq(idempotencyKeys.key, marker.key), eq(idempotencyKeys.userId, marker.userId)));
      }
    } catch {
      // Never fail the live response because replay bookkeeping failed.
    }
    return payload;
  });
}
