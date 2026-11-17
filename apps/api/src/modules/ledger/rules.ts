import { and, eq, sql, lte, desc, isNull, or } from "@repo/db";
import { db, commissionRules, type TxOrDb } from "@repo/db";
import { getConfig } from "../app-config/index.js";
import { recordAudit } from "../audit/index.js";

export interface CommissionRule {
  id: string;
  ownerId: string | null;
  rateBps: number;
  base: "pre_discount" | "post_discount";
  effectiveFrom: Date;
}

export async function getCommissionRule(
  exec: TxOrDb,
  ownerId: string,
  at: Date = new Date(),
): Promise<{ rateBps: number; base: "pre_discount" | "post_discount"; id: string | null }> {
  const rows = (await exec
    .select()
    .from(commissionRules)
    .where(
      and(
        or(eq(commissionRules.ownerId, ownerId), isNull(commissionRules.ownerId)),
        lte(commissionRules.effectiveFrom, at),
      ),
    )
    .orderBy(sql`(owner_id IS NULL) ASC`, desc(commissionRules.effectiveFrom))
    .limit(1)) as unknown as Array<{ id: string; ownerId: string | null; rateBps: number; base: string; effectiveFrom: Date }>;

  if (rows[0]) {
    return {
      id: rows[0].id,
      rateBps: rows[0].rateBps,
      base: rows[0].base as "pre_discount" | "post_discount",
    };
  }

  // Fallback to app_config defaults (seed/TBD) when no rule row exists.
  const rateBps = await getConfig("commission.default_rate_bps");
  const base = await getConfig("commission.default_base");
  return { id: null, rateBps, base };
}

export interface CreateCommissionRuleInput {
  ownerId?: string | null;
  rateBps: number;
  base: "pre_discount" | "post_discount";
  effectiveFrom: string | Date;
}

export async function createCommissionRule(
  input: CreateCommissionRuleInput,
  actorId: string,
  exec: TxOrDb = db,
): Promise<{ id: string }> {
  const effectiveFrom = typeof input.effectiveFrom === "string" ? new Date(input.effectiveFrom) : input.effectiveFrom;
  const inserted = await exec
    .insert(commissionRules)
    .values({
      ownerId: input.ownerId ?? null,
      rateBps: input.rateBps,
      base: input.base,
      effectiveFrom,
    })
    .returning({ id: commissionRules.id });

  const id = inserted[0]?.id;
  if (!id) throw new Error("commission rule insert returned no row");

  await recordAudit({
    actorId,
    actorRole: "admin",
    action: "commission_rule.create",
    entity: "commission_rules",
    entityId: id,
    after: { ownerId: input.ownerId ?? null, rateBps: input.rateBps, base: input.base, effectiveFrom: effectiveFrom.toISOString() },
  });

  return { id };
}
