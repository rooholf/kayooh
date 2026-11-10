/**
 * DEV-ONLY owner dashboard preview (never registered in production).
 *
 *   GET /api/v1/dev/owner/dashboard/summary?ownerId=<uuid>
 *
 * Returns the same shape as the authed GET /api/v1/owner/dashboard/summary
 * but without session authentication — so the web frontend can render during
 * development before the owner login flow ships. The ownerId query parameter
 * selects the tenant.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { validationError } from "../../lib/errors.js";
import { getDashboardSummary } from "./summary.js";

const querySchema = z.object({ ownerId: z.string().uuid() }).strict();

export function registerDevOwnerRoutes(
  app: FastifyInstance,
  opts: { nodeEnv: string },
): void {
  if (opts.nodeEnv === "production") return;

  app.get("/api/v1/dev/owner/dashboard/summary", async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) throw validationError(parsed.error);
    const summary = await getDashboardSummary(parsed.data.ownerId);
    return reply.code(200).send(summary);
  });
}
