/**
 * Admin console operations (SRS 7.4 — plan C.2.4, issue #41): owner/outlet
 * patch, pricing rules, config patch, flagged-scan queue, audit-log read.
 * Every mutation writes audit_log (FR-SEC-02.1, INV-6 append-only); routes
 * handle auth, validation, HTTP status mapping.
 */
import { and, asc, eq, gt, gte, lte, sql } from "@repo/db";
import {
  auditLog,
  categories,
  db,
  outlets,
  owners,
  pricingRules,
  scanEvents,
} from "@repo/db";
import { AppError } from "../../lib/errors.js";
import { recordAudit } from "../audit/index.js";
import type { PatchOutletBody } from "@repo/contracts";

/* ------------------------------- owners -------------------------------- */

export async function patchOwner(
  id: string,
  body: { status: "active" | "suspended" },
  actorId: string | null,
): Promise<{ id: string; status: string }> {
  const rows = await db.select().from(owners).where(eq(owners.id, id)).limit(1);
  const owner = rows[0];
  if (!owner) throw new AppError("NOT_FOUND");

  await db.update(owners).set({ status: body.status }).where(eq(owners.id, id));
  await recordAudit({
    actorId,
    actorRole: "admin",
    action: "owner.updated",
    entity: "owners",
    entityId: id,
    before: { status: owner.status },
    after: { status: body.status },
  });
  return { id, status: body.status };
}

/* ------------------------------- outlets ------------------------------- */

export async function patchOutlet(
  id: string,
  body: PatchOutletBody,
  actorId: string | null,
): Promise<{ id: string }> {
  const rows = await db.select().from(outlets).where(eq(outlets.id, id)).limit(1);
  const outlet = rows[0];
  if (!outlet) throw new AppError("NOT_FOUND");

  const patch: Partial<typeof outlets.$inferInsert> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.address !== undefined) patch.address = body.address;
  if (body.lat !== undefined) patch.lat = String(body.lat);
  if (body.lng !== undefined) patch.lng = String(body.lng);
  if (body.hours !== undefined) patch.hours = body.hours;
  if (body.status !== undefined) patch.status = body.status;

  await db.update(outlets).set(patch).where(eq(outlets.id, id));
  await recordAudit({
    actorId,
    actorRole: "admin",
    action: "outlet.updated",
    entity: "outlets",
    entityId: id,
    before: {
      name: outlet.name,
      description: outlet.description,
      address: outlet.address,
      lat: outlet.lat,
      lng: outlet.lng,
      hours: outlet.hours,
      status: outlet.status,
    },
    after: patch,
  });
  return { id };
}

/* ---------------------------- pricing rules ---------------------------- */

export async function createPricingRule(
  body: {
    outletId?: string;
    category: string;
    dayType: "all" | "weekday" | "weekend";
    rateIdr: number;
    effectiveFrom: string;
  },
  actorId: string | null,
): Promise<{ id: string }> {
  // FK targets: a clean 404/422 beats a raw 500 from the FK constraint.
  if (body.outletId) {
    const outlet = await db.select({ id: outlets.id }).from(outlets).where(eq(outlets.id, body.outletId)).limit(1);
    if (outlet.length === 0) throw new AppError("NOT_FOUND", "outletId does not exist");
  }
  const category = await db.select({ code: categories.code }).from(categories).where(eq(categories.code, body.category)).limit(1);
  if (category.length === 0) throw new AppError("CATEGORY_NOT_OFFERED", "Unknown category.");

  const [rule] = await db
    .insert(pricingRules)
    .values({
      outletId: body.outletId ?? null,
      category: body.category,
      dayType: body.dayType,
      rateIdr: BigInt(body.rateIdr),
      effectiveFrom: new Date(body.effectiveFrom),
    })
    .returning({ id: pricingRules.id });
  if (!rule) throw new Error("pricing rule insert returned no row");

  await recordAudit({
    actorId,
    actorRole: "admin",
    action: "pricing_rule.created",
    entity: "pricing_rules",
    entityId: rule.id,
    after: { ...body, rateIdr: body.rateIdr },
  });
  return { id: rule.id };
}

/* -------------------------------- config ------------------------------- */

// PATCH /admin/config delegates to app-config.setConfig (upsert + audit +
// cache eviction, config.test.ts-covered); the route maps UnknownConfigKey
// to 404 (SRS 7.4: the key must exist in section 4).

/* ---------------------------- flagged scans ---------------------------- */

export interface FlaggedScanRow {
  id: string;
  clientEventId: string;
  type: string;
  outletId: string | null;
  staffId: string | null;
  occurredAt: Date;
  receivedAt: Date;
  flagReason: string | null;
  resolution: string | null;
  resolutionNote: string | null;
  resolvedAt: Date | null;
}

export async function listFlaggedScans(query: {
  includeResolved?: "true" | "false";
  limit: number;
  cursor?: string;
}): Promise<{ items: FlaggedScanRow[]; nextCursor: string | null }> {
  const conditions = [eq(scanEvents.status, "flagged")];
  if (query.includeResolved !== "true") conditions.push(sql`resolution IS NULL`);
  if (query.cursor) conditions.push(gt(scanEvents.id, query.cursor));

  const rows = await db
    .select({
      id: scanEvents.id,
      clientEventId: scanEvents.clientEventId,
      type: scanEvents.type,
      outletId: scanEvents.outletId,
      staffId: scanEvents.staffId,
      occurredAt: scanEvents.occurredAt,
      receivedAt: scanEvents.receivedAt,
      flagReason: scanEvents.flagReason,
      resolution: scanEvents.resolution,
      resolutionNote: scanEvents.resolutionNote,
      resolvedAt: scanEvents.resolvedAt,
    })
    .from(scanEvents)
    .where(and(...conditions))
    .orderBy(asc(scanEvents.id))
    .limit(query.limit);

  return {
    items: rows,
    nextCursor: rows.length === query.limit ? (rows[rows.length - 1]?.id ?? null) : null,
  };
}

export async function resolveFlaggedScan(
  id: string,
  body: { resolution: "dismissed" | "corrected"; note: string },
  actorId: string | null,
): Promise<FlaggedScanRow> {
  const rows = await db.select().from(scanEvents).where(eq(scanEvents.id, id)).limit(1);
  const scan = rows[0];
  if (!scan) throw new AppError("NOT_FOUND");
  if (scan.status !== "flagged" || scan.resolution) {
    throw new AppError("STATE_CONFLICT", "Scan is not an open flagged item.");
  }

  await db
    .update(scanEvents)
    .set({ resolution: body.resolution, resolutionNote: body.note, resolvedBy: actorId, resolvedAt: new Date() })
    .where(eq(scanEvents.id, id));

  const updated = { ...scan, resolution: body.resolution, resolutionNote: body.note, resolvedBy: actorId, resolvedAt: new Date() };
  await recordAudit({
    actorId,
    actorRole: "admin",
    action: "flagged_scan.resolved",
    entity: "scan_events",
    entityId: id,
    before: { flagReason: scan.flagReason, resolution: null },
    after: { resolution: body.resolution },
  });
  return updated;
}

/* ------------------------------ audit log ------------------------------ */

export async function listAuditLog(query: {
  entity?: string;
  actorId?: string;
  from?: string;
  to?: string;
  limit: number;
  cursor?: string;
}): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
  const conditions = [];
  if (query.entity) conditions.push(eq(auditLog.entity, query.entity));
  if (query.actorId) conditions.push(eq(auditLog.actorId, query.actorId));
  if (query.from) conditions.push(gte(auditLog.createdAt, new Date(query.from)));
  if (query.to) conditions.push(lte(auditLog.createdAt, new Date(query.to)));
  if (query.cursor) conditions.push(gt(auditLog.id, query.cursor));

  const rows = await db
    .select()
    .from(auditLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(auditLog.id))
    .limit(query.limit);

  return {
    items: rows,
    nextCursor: rows.length === query.limit ? (rows[rows.length - 1]?.id ?? null) : null,
  };
}
