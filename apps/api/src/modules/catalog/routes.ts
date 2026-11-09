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
  vOutletCode,
  vUuid,
} from "@repo/contracts";
import { AppError, validationError } from "../../lib/errors.js";
import { getOutletByCode, getOutletById, listOutlets } from "./outlets.js";

export function registerCatalogRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: unknown }>("/api/v1/outlets", async (request, reply) => {
    const parsed = getOutletsQuerySchema.safeParse(request.query);
    if (!parsed.success) throw validationError(parsed.error);

    const response: OutletListResponse = await listOutlets(parsed.data);
    const checked: OutletListResponse = outletListResponseSchema.parse(response);

    return reply.code(200).send(checked);
  });

  // Direct booking entry (FR-CAT-01, revision 1.3): resolve an outlet by its
  // code from the link-in-bio URL. Same item shape as the list response
  // (counts only — NEG-2); 404 NOT_FOUND when unknown or inactive.
  app.get<{ Params: { code: string } }>(
    "/api/v1/outlets/by-code/:code",
    async (request) => {
      const code = vOutletCode.safeParse(request.params.code);
      if (!code.success) throw validationError(code.error);
      const outlet = await getOutletByCode(code.data);
      if (outlet === null) throw new AppError("NOT_FOUND");
      return outlet;
    },
  );

  // Single outlet by id (SRS endpoint table: GET /outlets/{id}).
  app.get<{ Params: { id: string } }>("/api/v1/outlets/:id", async (request) => {
    const id = vUuid.safeParse(request.params.id);
    if (!id.success) throw validationError(id.error);
    const outlet = await getOutletById(id.data);
    if (outlet === null) throw new AppError("NOT_FOUND");
    return outlet;
  });
}
