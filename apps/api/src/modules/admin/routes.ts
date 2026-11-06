import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  vAssetTag,
  vCategoryCode,
  vHours,
  vLat,
  vLng,
  vOutletCode,
  vTextL,
  vTextS,
  vUuid,
} from "@repo/contracts";
import { AppError, validationError } from "../../lib/errors.js";
import { requireRole } from "../identity/guards.js";
import { createOwner, createOutlet, createBike, createBikesBulk } from "./onboarding.js";

const ownerSchema = z
  .object({
    name: vTextS,
    bankCode: vTextS,
    bankAccountNumber: z.string().regex(/^[0-9]{6,20}$/),
    bankAccountName: vTextS,
  })
  .strict();

const outletSchema = z
  .object({
    ownerId: vUuid,
    code: vOutletCode,
    name: vTextS,
    address: vTextS,
    description: vTextL.optional(),
    lat: vLat,
    lng: vLng,
    hours: vHours,
    categories: z.array(vCategoryCode).min(1),
  })
  .strict();

const bikeSchema = z
  .object({
    assetTag: vAssetTag,
    category: vCategoryCode,
    homeOutletId: vUuid,
  })
  .strict();

const bulkSchema = z
  .object({
    items: z.array(bikeSchema).min(1).max(200),
  })
  .strict();

export function registerAdminRoutes(app: FastifyInstance): void {
  app.post("/api/v1/admin/owners", { preHandler: requireRole("admin") }, async (request, reply) => {
    const parsed = ownerSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    const principal = request.principal!;
    const { id } = await createOwner({ ...parsed.data, actorId: principal.userId });
    return reply.code(201).send({ id });
  });

  app.post("/api/v1/admin/outlets", { preHandler: requireRole("admin") }, async (request, reply) => {
    const parsed = outletSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    const principal = request.principal!;
    try {
      const { id } = await createOutlet({ ...parsed.data, actorId: principal.userId });
      return reply.code(201).send({ id });
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw e;
    }
  });

  app.post("/api/v1/admin/bikes", { preHandler: requireRole("admin") }, async (request, reply) => {
    const parsed = bikeSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    const principal = request.principal!;
    const { id } = await createBike({ ...parsed.data, actorId: principal.userId });
    return reply.code(201).send({ id });
  });

  app.post("/api/v1/admin/bikes/bulk", { preHandler: requireRole("admin") }, async (request, reply) => {
    const parsed = bulkSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    const principal = request.principal!;
    const result = await createBikesBulk(parsed.data.items, principal.userId);
    return reply.code(201).send(result);
  });
}