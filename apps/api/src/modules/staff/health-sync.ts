/**
 * FR-INV-05 — five-minute health sync + drift check.
 * Computes expected (non-rented bikes homed at the staff outlet), compares
 * against the staff-reported physical counts, records the drift check, and
 * (above threshold) notifies admins + writes an audit_log row. Never touches
 * reservations (INV-2).
 */
import { eq, sql } from "@repo/db";
import {
  db,
  inventoryDriftChecks,
  users,
} from "@repo/db";
import { getConfig } from "../app-config/index.js";
import { recordAudit } from "../audit/index.js";
import { enqueueNotification } from "../notifications/index.js";
import { DEFAULT_CHANNEL_BY_TEMPLATE } from "../../lib/notifications.js";

export interface HealthSyncInput {
  sentAt: string;
  physicalCounts?: Record<string, number>;
  staffOutletId: string;
  staffUserId: string;
}

export interface HealthSyncResult {
  driftPct?: number;
}

export async function runHealthSync(input: HealthSyncInput): Promise<HealthSyncResult> {
  // Expected counts: bikes homed at this outlet, not currently in rental.
  const rows = (await db.execute(sql`
    SELECT category, count(*)::int AS n
    FROM bikes
    WHERE current_outlet_id = ${input.staffOutletId}::uuid
      AND state <> 'in_rental'
    GROUP BY category
  `)) as unknown as { rows: Array<{ category: string; n: number | string }> };

  const expected: Record<string, number> = {};
  for (const r of rows.rows) {
    if (r && r.category) expected[r.category] = Number(r.n);
  }

  if (!input.physicalCounts) {
    return {};
  }

  const reported = input.physicalCounts;
  const categories = new Set([...Object.keys(expected), ...Object.keys(reported)]);
  let sumAbs = 0;
  let sumExpected = 0;
  for (const c of categories) {
    const e = expected[c] ?? 0;
    const r = reported[c] ?? 0;
    sumAbs += Math.abs(e - r);
    sumExpected += e;
  }
  const driftPct = Math.round((100 * sumAbs) / Math.max(sumExpected, 1) * 100) / 100;

  await db.insert(inventoryDriftChecks).values({
    outletId: input.staffOutletId,
    checkedAt: new Date(input.sentAt),
    expected,
    reported,
    driftPct: String(driftPct),
  });

  const threshold = await getConfig("sync.drift_max_pct");
  if (driftPct > threshold) {
    // Notify every admin.
    const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
    for (const a of admins) {
      await db.transaction(async (tx) => {
        await enqueueNotification(tx, {
          userId: a.id,
          channel: DEFAULT_CHANNEL_BY_TEMPLATE.drift_alert,
          template: "drift_alert",
          vars: { outletId: input.staffOutletId, driftPct },
        });
      });
    }
    await recordAudit({
      actorId: input.staffUserId,
      actorRole: "staff",
      action: "inventory.drift_alert",
      entity: "inventory_drift_checks",
      entityId: null,
      after: { outletId: input.staffOutletId, driftPct, expected, reported },
    });
  }

  return { driftPct };
}