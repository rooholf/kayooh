/**
 * Audit log (FR-SEC-02.1, INV-6 append-only).
 * Receives a row for: every admin mutation, ID document view, flagged-scan
 * resolution, config change, commission rule change, payout and dispute
 * action, deposit release and claim decision.
 */
import { db } from "@repo/db";
import { auditLog } from "@repo/db";

export interface AuditEntry {
  actorId?: string | null;
  actorRole: string;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorId: entry.actorId ?? null,
    actorRole: entry.actorRole,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
