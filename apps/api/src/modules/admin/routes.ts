import type { FastifyInstance } from "fastify";
import {
  auditLogQuerySchema,
  bikeStateChangeSchema,
  configPatchSchema,
  createBikeSchema,
  createOutletSchema,
  createOwnerSchema,
  bulkBikesSchema,
  flaggedScanQuerySchema,
  flaggedScanResolveSchema,
  idParamSchema,
  patchOutletSchema,
  patchOwnerSchema,
  pricingRuleSchema,
} from "@repo/contracts";
import { AppError, validationError } from "../../lib/errors.js";
import { ZodError } from "zod";
import { requireRole } from "../identity/guards.js";
import { db, bikes, bikeEvents, eq } from "@repo/db";
import { createOwner, createOutlet, createBike, createBikesBulk } from "./onboarding.js";
import { setConfig } from "../app-config/index.js";
import {
  createPricingRule,
  listAuditLog,
  listFlaggedScans,
  patchOutlet,
  patchOwner,
  resolveFlaggedScan,
} from "./ops.js";

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

  /* --------------- §7.4 wiring (plan C.2.4, issue #41) ----------------- */

  // PATCH /admin/owners/{id} — status active/suspended (FR-CAT-02).
  app.patch("/api/v1/admin/owners/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) throw validationError(params.error);
    const body = patchOwnerSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error);
    const result = await patchOwner(params.data.id, body.data, request.principal!.userId);
    return reply.code(200).send(result);
  });

  // PATCH /admin/outlets/{id} — status/hours/name/description/address/lat/lng.
  app.patch("/api/v1/admin/outlets/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) throw validationError(params.error);
    const body = patchOutletSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error);
    const result = await patchOutlet(params.data.id, body.data, request.principal!.userId);
    return reply.code(200).send(result);
  });

  // POST /admin/users is registered by the identity module (FR-ID-02.1).

  // POST /admin/pricing-rules — configurable rates (SRS §4 note: seed is
  // mock data, never policy). rateIdr is integer rupiah (INV-5).
  app.post("/api/v1/admin/pricing-rules", { preHandler: requireRole("admin") }, async (request, reply) => {
    const parsed = pricingRuleSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    const result = await createPricingRule(parsed.data, request.principal!.userId);
    return reply.code(201).send(result);
  });

  // PATCH /admin/config — {key, value}; key must exist in section 4 and the
  // value is type-checked against that key's registry schema. Delegates to
  // app-config.setConfig (upsert + audit + cache eviction); UnknownConfigKey
  // maps to 404 NOT_FOUND.
  app.patch("/api/v1/admin/config", { preHandler: requireRole("admin") }, async (request, reply) => {
    const parsed = configPatchSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    try {
      const result = await setConfig({
        key: parsed.data.key,
        value: parsed.data.value,
        actorId: request.principal!.userId,
      });
      return reply.code(200).send(result);
    } catch (e) {
      if (e instanceof Error && e.name === "UnknownConfigKey") {
        throw new AppError("NOT_FOUND", "Unknown config key.");
      }
      if (e instanceof ZodError) {
        throw validationError(e); // value type-check failure -> 400
      }
      throw e;
    }
  });

  // GET /admin/flagged-scans — the unresolved flagged queue (FR-SEC-02.2).
  app.get("/api/v1/admin/flagged-scans", { preHandler: requireRole("admin") }, async (request, reply) => {
    const parsed = flaggedScanQuerySchema.safeParse(request.query);
    if (!parsed.success) throw validationError(parsed.error);
    const result = await listFlaggedScans(parsed.data);
    return reply.code(200).send(result);
  });

  // PATCH /admin/flagged-scans/{id} — resolution dismissed/corrected + note.
  app.patch("/api/v1/admin/flagged-scans/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) throw validationError(params.error);
    const body = flaggedScanResolveSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error);
    const result = await resolveFlaggedScan(params.data.id, body.data, request.principal!.userId);
    return reply.code(200).send({
      id: result.id,
      resolution: result.resolution,
      resolutionNote: result.resolutionNote,
      resolvedAt: result.resolvedAt,
    });
  });

  // GET /admin/audit-log — entity/actorId/from/to filters + paging.
  app.get("/api/v1/admin/audit-log", { preHandler: requireRole("admin") }, async (request, reply) => {
    const parsed = auditLogQuerySchema.safeParse(request.query);
    if (!parsed.success) throw validationError(parsed.error);
    const result = await listAuditLog(parsed.data);
    return reply.code(200).send(result);
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