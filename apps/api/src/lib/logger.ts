/**
 * Request logging is Fastify's bundled pino (configured in app.ts):
 * JSON, one line per request with requestId, redactions per NFR-06/NEG-4.
 * This plugin only adds the requestId hook.
 */
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

export function loggingPlugin(app: FastifyInstance): void {
  app.addHook("onRequest", async (req) => {
    const headerId = req.headers["x-request-id"];
    req.id = typeof headerId === "string" && headerId.length <= 64 ? headerId : randomUUID();
  });
}
