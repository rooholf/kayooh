import type { FastifyInstance } from "fastify";
import {
  ownerBikesQuerySchema,
  ownerCategoryParamsSchema,
  ownerCategoryPatchSchema,
  ownerRentalsQuerySchema,
  ownerSettingsPatchSchema,
} from "@repo/contracts";
import { and, eq, sql, outletCategories, owners } from "@repo/db";
import { AppError, validationError } from "../../lib/errors.js";
import { requireRole } from "../identity/guards.js";
import { withOwnerContext } from "./context.js";
import { getDashboardSummary } from "./summary.js";

export function registerOwnerRoutes(app: FastifyInstance): void {
  // GET /owner/dashboard/summary
  app.get("/api/v1/owner/dashboard/summary", { preHandler: requireRole("owner") }, async (request, reply) => {
    const principal = request.principal!;
    if (!principal.ownerId) throw new AppError("FORBIDDEN");
    const summary = await getDashboardSummary(principal.ownerId);
    return reply.code(200).send(summary);
  });

  // GET /owner/rentals
  app.get("/api/v1/owner/rentals", { preHandler: requireRole("owner") }, async (request, reply) => {
    const principal = request.principal!;
    if (!principal.ownerId) throw new AppError("FORBIDDEN");
    const parsed = ownerRentalsQuerySchema.safeParse(request.query);
    if (!parsed.success) throw validationError(parsed.error);
    const q = parsed.data;
    const rows = await withOwnerContext(principal.ownerId, async (tx) => {
      let where = sql`TRUE`;
      if (q.status) where = sql`${where} AND r.status = ${q.status}`;
      if (q.from) where = sql`${where} AND r.created_at >= ${new Date(q.from)}::timestamptz`;
      if (q.to) where = sql`${where} AND r.created_at <= ${new Date(q.to)}::timestamptz`;
      if (q.cursor) where = sql`${where} AND r.id > ${q.cursor}::uuid`;
      const res = (await tx.execute(sql`
        SELECT r.id, r.status, r.checked_out_at, r.expected_end_at, r.price_idr,
               b.asset_tag, o.id AS outlet_id
        FROM rentals r
        JOIN bikes b ON b.id = r.bike_id
        JOIN outlets o ON o.id = b.home_outlet_id
        WHERE o.owner_id = ${principal.ownerId}::uuid
          AND ${where}
        ORDER BY r.id
        LIMIT ${q.limit}
      `)) as unknown as { rows: Array<Record<string, unknown>> };
      return res.rows;
    });
    return reply.code(200).send({ items: rows, nextCursor: rows.length === q.limit ? rows[rows.length - 1]?.id : null });
  });

  // GET /owner/bikes
  app.get("/api/v1/owner/bikes", { preHandler: requireRole("owner") }, async (request, reply) => {
    const principal = request.principal!;
    if (!principal.ownerId) throw new AppError("FORBIDDEN");
    const parsed = ownerBikesQuerySchema.safeParse(request.query);
    if (!parsed.success) throw validationError(parsed.error);
    const q = parsed.data;
    const rows = await withOwnerContext(principal.ownerId, async (tx) => {
      let where = sql`TRUE`;
      if (q.outletId) where = sql`${where} AND b.home_outlet_id = ${q.outletId}::uuid`;
      if (q.state) where = sql`${where} AND b.state = ${q.state}`;
      if (q.category) where = sql`${where} AND b.category = ${q.category}`;
      if (q.cursor) where = sql`${where} AND b.id > ${q.cursor}::uuid`;
      const res = (await tx.execute(sql`
        SELECT b.id, b.asset_tag, b.category, b.state, b.home_outlet_id, b.current_outlet_id
        FROM bikes b
        JOIN outlets o ON o.id = b.home_outlet_id
        WHERE o.owner_id = ${principal.ownerId}::uuid
          AND ${where}
        ORDER BY b.id
        LIMIT ${q.limit}
      `)) as unknown as { rows: Array<Record<string, unknown>> };
      return res.rows;
    });
    return reply.code(200).send({ items: rows, nextCursor: rows.length === q.limit ? rows[rows.length - 1]?.id : null });
  });

  // PATCH /owner/outlets/:outletId/categories/:category
  app.patch("/api/v1/owner/outlets/:outletId/categories/:category", { preHandler: requireRole("owner") }, async (request, reply) => {
    const params = ownerCategoryParamsSchema.safeParse(request.params);
    if (!params.success) throw validationError(params.error);
    const body = ownerCategoryPatchSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error);
    const principal = request.principal!;
    if (!principal.ownerId) throw new AppError("FORBIDDEN");
    await withOwnerContext(principal.ownerId, async (tx) => {
      // Check inService - buffer >= 0
      const inServiceRes = (await tx.execute(sql`
        SELECT count(*)::int AS n FROM bikes WHERE home_outlet_id = ${params.data.outletId}::uuid AND state <> 'maintenance' AND state <> 'unavailable'
      `)) as unknown as { rows: Array<{ n: number | string }> };
      const inService = Number(inServiceRes.rows[0]?.n ?? 0);
      if (inService - body.data.safetyBuffer < 0) throw new AppError("STATE_CONFLICT");
      await tx
        .update(outletCategories)
        .set({ safetyBuffer: body.data.safetyBuffer })
        .where(and(eq(outletCategories.outletId, params.data.outletId), eq(outletCategories.category, params.data.category)));
    });
    return reply.code(200).send({ ok: true });
  });

  // PATCH /owner/settings
  app.patch("/api/v1/owner/settings", { preHandler: requireRole("owner") }, async (request, reply) => {
    const parsed = ownerSettingsPatchSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    const principal = request.principal!;
    if (!principal.ownerId) throw new AppError("FORBIDDEN");
    await withOwnerContext(principal.ownerId, async (tx) => {
      await tx.update(owners).set({ promoOptOut: parsed.data.promoOptOut }).where(eq(owners.id, principal.ownerId!));
    });
    return reply.code(200).send({ ok: true });
  });
}