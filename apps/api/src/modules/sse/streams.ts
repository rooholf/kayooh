/**
 * SSE streams (FR-REP-02). Architecture init scaffold.
 *
 * Real pub/sub wiring (Redis) and owner filtering land in the full
 * implementation step; this scaffold registers the two endpoints with the
 * correct auth boundaries and heartbeat contract.
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { AppError } from "../../lib/errors.js";
import type { Principal } from "../identity/guards.js";
import { requireRole } from "../identity/guards.js";

export function registerSseRoutes(app: FastifyInstance): void {
  // Public, anonymous availability stream (FR-REP-02.1).
  app.get("/api/v1/outlets/stream", async (request, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    // Heartbeat comment every 25 s (FR-REP-02.1).
    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, 25_000);
    request.raw.on("close", () => clearInterval(heartbeat));
    // Initial ack; real availability events are pushed via Redis pub/sub.
    reply.raw.write("event: ready\ndata: {}\n\n");
  });

  // Owner-scoped stream (FR-REP-02.2); 401 without a session.
  app.get("/api/v1/owner/stream", { preHandler: requireRole("owner") }, async (request, reply: FastifyReply) => {
    const principal: Principal | undefined = request.principal;
    if (!principal) throw new AppError("UNAUTHENTICATED");
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, 25_000);
    request.raw.on("close", () => clearInterval(heartbeat));
    reply.raw.write("event: ready\ndata: {}\n\n");
  });
}