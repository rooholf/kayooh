/**
 * FR-CAT-02 admin onboarding — owners, outlets, bikes.
 * All mutations write audit_log (FR-SEC-02.1). Pure DB helpers; routes layer
 * handles auth, validation, and HTTP status mapping.
 */
import { and, eq } from "@repo/db";
import {
  bikes,
  bikeEvents,
  db,
  outletCategories,
  outlets,
  owners,
} from "@repo/db";
import { AppError } from "../../lib/errors.js";
import { getConfig } from "../app-config/index.js";
import { recordAudit } from "../audit/index.js";

export interface CreateOwnerInput {
  name: string;
  bankCode: string;
  bankAccountNumber: string;
  bankAccountName: string;
  actorId: string | null;
}

export async function createOwner(input: CreateOwnerInput): Promise<{ id: string }> {
  const [owner] = await db
    .insert(owners)
    .values({
      name: input.name,
      bankCode: input.bankCode,
      bankAccountNumber: input.bankAccountNumber,
      bankAccountName: input.bankAccountName,
    })
    .returning({ id: owners.id });
  if (!owner) throw new Error("owner insert returned no row");

  await recordAudit({
    actorId: input.actorId,
    actorRole: "admin",
    action: "owner.created",
    entity: "owners",
    entityId: owner.id,
    after: { name: input.name },
  });
  return { id: owner.id };
}

export interface CreateOutletInput {
  ownerId: string;
  code: string;
  name: string;
  address: string;
  description?: string;
  lat: number;
  lng: number;
  hours: Record<string, unknown>;
  categories: string[];
  actorId: string | null;
}

export async function createOutlet(input: CreateOutletInput): Promise<{ id: string }> {
  // Sister-outlet gate (FR-CAT-02.2).
  const sisterEnabled = await getConfig("feature.sister_outlets_enabled");
  if (!sisterEnabled) {
    const existing = await db
      .select({ id: outlets.id })
      .from(outlets)
      .where(eq(outlets.ownerId, input.ownerId))
      .limit(1);
    if (existing.length > 0) throw new AppError("MULTI_OUTLET_DISABLED");
  }

  // Duplicate code (unique index also enforces, but a clean 409 is nicer).
  const dup = await db
    .select({ id: outlets.id })
    .from(outlets)
    .where(eq(outlets.code, input.code))
    .limit(1);
  if (dup.length > 0) throw new AppError("DUPLICATE_RESOURCE");

  const [outlet] = await db
    .insert(outlets)
    .values({
      ownerId: input.ownerId,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      address: input.address,
      lat: String(input.lat),
      lng: String(input.lng),
      hours: input.hours,
    })
    .returning({ id: outlets.id });
  if (!outlet) throw new Error("outlet insert returned no row");

  await db.insert(outletCategories).values(
    input.categories.map((c) => ({
      outletId: outlet.id,
      category: c,
      ownerId: input.ownerId,
      safetyBuffer: 0,
    })),
  );

  await recordAudit({
    actorId: input.actorId,
    actorRole: "admin",
    action: "outlet.created",
    entity: "outlets",
    entityId: outlet.id,
    after: { code: input.code, ownerId: input.ownerId, categories: input.categories },
  });
  return { id: outlet.id };
}

export interface CreateBikeInput {
  assetTag: string;
  category: string;
  homeOutletId: string;
  actorId: string | null;
}

export async function createBike(input: CreateBikeInput): Promise<{ id: string }> {
  // Category must be offered by the outlet.
  const oc = await db
    .select({ category: outletCategories.category })
    .from(outletCategories)
    .where(and(eq(outletCategories.outletId, input.homeOutletId), eq(outletCategories.category, input.category)))
    .limit(1);
  if (oc.length === 0) throw new AppError("CATEGORY_NOT_OFFERED");

  const outletRows = await db
    .select({ ownerId: outlets.ownerId })
    .from(outlets)
    .where(eq(outlets.id, input.homeOutletId))
    .limit(1);
  const ownerId = outletRows[0]?.ownerId;
  if (!ownerId) throw new AppError("NOT_FOUND");

  // Duplicate asset tag.
  const dup = await db.select({ id: bikes.id }).from(bikes).where(eq(bikes.assetTag, input.assetTag)).limit(1);
  if (dup.length > 0) throw new AppError("DUPLICATE_RESOURCE");

  const [bike] = await db
    .insert(bikes)
    .values({
      assetTag: input.assetTag,
      category: input.category,
      homeOutletId: input.homeOutletId,
      currentOutletId: input.homeOutletId,
      state: "available",
      ownerId,
    })
    .returning({ id: bikes.id });
  if (!bike) throw new Error("bike insert returned no row");

  await db.insert(bikeEvents).values({
    bikeId: bike.id,
    ownerId,
    type: "registered",
    fromState: null,
    toState: "available",
    outletId: input.homeOutletId,
    occurredAt: new Date(),
  });

  await recordAudit({
    actorId: input.actorId,
    actorRole: "admin",
    action: "bike.created",
    entity: "bikes",
    entityId: bike.id,
    after: { assetTag: input.assetTag, category: input.category, homeOutletId: input.homeOutletId },
  });
  return { id: bike.id };
}

export async function createBikesBulk(
  items: Array<{ assetTag: string; category: string; homeOutletId: string }>,
  actorId: string | null,
): Promise<{ created: number; ids: string[] }> {
  // All-or-nothing: validate every item first, then insert.
  const ids: string[] = [];
  await db.transaction(async (tx) => {
    // Pre-validate categories + outlets + duplicates (in-tx so the bulk is atomic).
    const seen = new Set<string>();
    for (const it of items) {
      if (seen.has(it.assetTag)) throw new AppError("DUPLICATE_RESOURCE");
      seen.add(it.assetTag);
      const oc = await tx
        .select({ category: outletCategories.category })
        .from(outletCategories)
        .where(and(eq(outletCategories.outletId, it.homeOutletId), eq(outletCategories.category, it.category)))
        .limit(1);
      if (oc.length === 0) throw new AppError("CATEGORY_NOT_OFFERED");
      const dup = await tx.select({ id: bikes.id }).from(bikes).where(eq(bikes.assetTag, it.assetTag)).limit(1);
      if (dup.length > 0) throw new AppError("DUPLICATE_RESOURCE");
    }
    for (const it of items) {
      const outletRows = await tx
        .select({ ownerId: outlets.ownerId })
        .from(outlets)
        .where(eq(outlets.id, it.homeOutletId))
        .limit(1);
      const ownerId = outletRows[0]?.ownerId;
      if (!ownerId) throw new AppError("NOT_FOUND");
      const [bike] = await tx
        .insert(bikes)
        .values({
          assetTag: it.assetTag,
          category: it.category,
          homeOutletId: it.homeOutletId,
          currentOutletId: it.homeOutletId,
          state: "available",
          ownerId,
        })
        .returning({ id: bikes.id });
      if (!bike) throw new Error("bike insert returned no row");
      ids.push(bike.id);
      await tx.insert(bikeEvents).values({
        bikeId: bike.id,
        ownerId,
        type: "registered",
        fromState: null,
        toState: "available",
        outletId: it.homeOutletId,
        occurredAt: new Date(),
      });
    }
  });
  // Audit one row for the bulk (entity = bikes, after = count).
  await recordAudit({
    actorId,
    actorRole: "admin",
    action: "bikes.bulk_created",
    entity: "bikes",
    entityId: null,
    after: { count: items.length },
  });
  return { created: items.length, ids };
}