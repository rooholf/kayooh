import type { FastifyInstance } from "fastify";
import {
  bikeStateChangeSchema,
  createBikeSchema,
  createOutletSchema,
  createOwnerSchema,
  bulkBikesSchema,
  idParamSchema,
} from "@repo/contracts";
import { AppError, validationError } from "../../lib/errors.js";
import { requireRole } from "../identity/guards.js";
import { db, bikes, bikeEvents, eq } from "@repo/db";
import { createOwner, createOutlet, createBike, createBikesBulk } from "./onboarding.js";

export function registerAdminRoutes(app: FastifyInstance): void {
  app.post("/api/v1/admin/owners", { preHandler: requireRole("admin") }, async (request, reply) => {
    const parsed = createOwnerSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    const principal = request.principal!;
    const { id } = await createOwner({ ...parsed.data, actorId: principal.userId });
    return reply.code(201).send({ id });
  });

  app.post("/api/v1/admin/outlets", { preHandler: requireRole("admin") }, async (request, reply) => {
    const parsed = createOutletSchema.safeParse(request.body);
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
    const parsed = createBikeSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    const principal = request.principal!;
    const { id } = await createBike({ ...parsed.data, actorId: principal.userId });
    return reply.code(201).send({ id });
  });

  app.post("/api/v1/admin/bikes/bulk", { preHandler: requireRole("admin") }, async (request, reply) => {
    const parsed = bulkBikesSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    const principal = request.principal!;
    const result = await createBikesBulk(parsed.data.items, principal.userId);
    return reply.code(201).send(result);
  });

  // PATCH /admin/bikes/{id}/state — manual bike state transition (SRS 5.1).
  // Illegal transitions -> 409 STATE_CONFLICT; allowed ones write exactly one
  // bike_events row (INV-4).
  app.patch("/api/v1/admin/bikes/:id/state", { preHandler: requireRole("admin") }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) throw validationError(params.error);
    const body = bikeStateChangeSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error);

    const principal = request.principal!;
    const bikeRows = await db.select().from(bikes).where(eq(bikes.id, params.data.id)).limit(1);
    const bike = bikeRows[0];
    if (!bike) throw new AppError("NOT_FOUND");

    const allowed = adminTransitionAllowed(bike.state, body.data.to);
    if (!allowed) throw new AppError("STATE_CONFLICT", "Illegal bike state transition.");

    const occurredAt = new Date();
    await db.update(bikes).set({ state: body.data.to }).where(eq(bikes.id, bike.id));
    await db.insert(bikeEvents).values({
      bikeId: bike.id,
      ownerId: bike.ownerId,
      type: "state_changed",
      fromState: bike.state,
      toState: body.data.to,
      outletId: bike.currentOutletId,
      staffId: principal.userId,
      clientEventId: null,
      occurredAt,
      payload: { reason: body.data.reason, actor: "admin" },
    });

    return reply.code(200).send({ id: bike.id, state: body.data.to });
  });
}

function adminTransitionAllowed(
  from: (typeof bikes.$inferSelect)["state"],
  to: (typeof bikes.$inferSelect)["state"],
): boolean {
  if (from === "available" && (to === "maintenance" || to === "unavailable")) return true;
  if (from === "maintenance" && to === "available") return true;
  if (from === "unavailable" && to === "available") return true;
  return false;
}