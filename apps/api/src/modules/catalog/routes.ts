/**
 * GET /outlets (SRS endpoint table, FR-CAT-01) — public, no auth.
 * Zod .strict() query validation; 400 VALIDATION_ERROR on failure (the
 * envelope serialization lives in app.ts's error handler). NEG-4: lat/lng
 * never touch storage or logs.
 */
import type { FastifyInstance } from "fastify";
import {
  getOutletsQuerySchema,
  outletListResponseSchema,
  type OutletListResponse,
} from "@repo/contracts";
import { validationError } from "../../lib/errors.js";
import { listOutlets } from "./outlets.js";

export function registerCatalogRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: unknown }>("/api/v1/outlets", async (request, reply) => {
    const parsed = getOutletsQuerySchema.safeParse(request.query);
    if (!parsed.success) throw validationError(parsed.error);

    const response: OutletListResponse = await listOutlets(parsed.data);
    const checked: OutletListResponse = outletListResponseSchema.parse(response);

    return reply.code(200).send(checked);
  });
}
