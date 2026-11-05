/**
 * FR-INV-03 sweeper + FR-RNT-04 overdue escalation + FR-INV-04 reallocation
 * deadlines. All updates are guarded (idempotent) so the minute cron and the
 * delayed `release-hold` job (and Redis-loss recovery) can run the same SQL
 * repeatedly without double-charging or double-notifying.
 */
import { and, eq, sql } from "@repo/db";
import {
  db,
  notifications,
  outboxEvents,
  paymentIntents,
  refunds,
  rentals,
  reservations,
  renters,
  users,
} from "@repo/db";
import { getConfig } from "../app-config/index.js";

export interface SweeperSummary {
  expiredHolds: number;
  noShows: number;
  escalated: number;
  reallocationCancelled: number;
}

export async function runSweeper(): Promise<SweeperSummary> {
  const summary: SweeperSummary = {
    expiredHolds: 0,
    noShows: 0,
    escalated: 0,
    reallocationCancelled: 0,
  };

  const expiredRes = (await db.execute(sql`
    UPDATE reservations
    SET status = 'expired'
    WHERE status = 'held' AND expires_at IS NOT NULL AND expires_at <= now()
    RETURNING id, renter_id, outlet_id, category
  `)) as unknown as { rows: Array<{ id: string; renter_id: string; outlet_id: string; category: string } | undefined> };
  const expired = expiredRes.rows.filter(Boolean) as Array<{ id: string; renter_id: string; outlet_id: string; category: string }>;
  summary.expiredHolds = expired.length;

  if (expired.length > 0) {
    const ids = expired.map((r) => r.id);
    await db
      .update(paymentIntents)
      .set({ status: "expired" })
      .where(and(sql`${paymentIntents.reservationId} = ANY(${ids}::uuid[])`, sql`${paymentIntents.status} IN ('created','pending')`));

    for (const r of expired) {
      await db.insert(outboxEvents).values({
        type: "reservation.released",
        payload: { reservationId: r.id, renterId: r.renter_id, outletId: r.outlet_id, category: r.category },
      });
    }
  }

  const graceMinutes = await getConfig("noshow.grace_minutes");
  const refundPolicy = await getConfig("noshow.refund_policy");
  const noShowRes = (await db.execute(sql`
    UPDATE reservations
    SET status = 'no_show'
    WHERE status = 'confirmed'
      AND starts_at + make_interval(mins => ${graceMinutes}) <= now()
    RETURNING id, renter_id, final_idr
  `)) as unknown as { rows: Array<{ id: string; renter_id: string; final_idr: string | number } | undefined> };
  const noShows = noShowRes.rows.filter(Boolean) as Array<{ id: string; renter_id: string; final_idr: string | number }>;
  summary.noShows = noShows.length;

  for (const ns of noShows) {
    const renterUser = await db
      .select({ userId: renters.userId })
      .from(renters)
      .where(eq(renters.id, ns.renter_id))
      .limit(1);
    const userId = renterUser[0]?.userId;
    if (userId) {
      await db.insert(notifications).values({
        userId,
        channel: "whatsapp",
        template: "no_show",
        vars: { reservationId: ns.id },
        status: "queued",
      });
    }

    if (refundPolicy === "full_refund") {
      const intents = await db
        .select({ id: paymentIntents.id })
        .from(paymentIntents)
        .where(and(eq(paymentIntents.reservationId, ns.id), eq(paymentIntents.purpose, "booking")))
        .limit(1);
      const intent = intents[0];
      if (intent) {
        await db.insert(refunds).values({
          paymentIntentId: intent.id,
          reservationId: ns.id,
          amountIdr: BigInt(ns.final_idr),
          reason: "no_show",
          status: "pending",
        });
      }
    }
  }

  const escalation = await getConfig("late.escalation_minutes");
  const rentalsRes = (await db.execute(sql`
    SELECT r.id, r.expected_end_at, r.escalation_stage, r.renter_id, r.owner_id,
           ru.id AS renter_user_id, ou.id AS owner_user_id
    FROM rentals r
    JOIN renters ren ON ren.id = r.renter_id
    JOIN users ru ON ru.id = ren.user_id
    LEFT JOIN users ou ON ou.owner_id = r.owner_id
    WHERE r.status = 'open'
  `)) as unknown as {
    rows: Array<{
      id: string;
      expected_end_at: Date | string;
      escalation_stage: number;
      renter_id: string;
      owner_id: string;
      renter_user_id: string;
      owner_user_id: string | null;
    } | undefined>;
  };
  const openRentals = rentalsRes.rows.filter(Boolean) as Array<{
    id: string;
    expected_end_at: Date | string;
    escalation_stage: number;
    renter_id: string;
    owner_id: string;
    renter_user_id: string;
    owner_user_id: string | null;
  }>;

  const now = new Date();
  for (const r of openRentals) {
    const expected = r.expected_end_at instanceof Date ? r.expected_end_at : new Date(r.expected_end_at);
    const overdueMinutes = Math.floor((now.getTime() - expected.getTime()) / 60_000);
    if (overdueMinutes < 0) continue;

    let target = 0;
    if (overdueMinutes >= escalation.claim_eligible) target = 4;
    else if (overdueMinutes >= escalation.owner_flag) target = 3;
    else if (overdueMinutes >= escalation.staff_call) target = 2;
    else if (overdueMinutes >= escalation.reminder) target = 1;

    if (target <= r.escalation_stage) continue;

    const upd = (await db.execute(sql`
      UPDATE rentals SET escalation_stage = ${target}
      WHERE id = ${r.id} AND escalation_stage < ${target}
      RETURNING id
    `)) as unknown as { rows: Array<{ id: string } | undefined> };
    if (upd.rows.length === 0) continue;
    summary.escalated += 1;

    if (target >= 1 && r.escalation_stage < 1) {
      await db.insert(notifications).values({
        userId: r.renter_user_id,
        channel: "whatsapp",
        template: "late_reminder",
        vars: { rentalId: r.id, escalationStage: target },
        status: "queued",
      });
    }
    if (target >= 3 && r.escalation_stage < 3 && r.owner_user_id) {
      await db.insert(notifications).values({
        userId: r.owner_user_id,
        channel: "whatsapp",
        template: "owner_late_flag",
        vars: { rentalId: r.id, escalationStage: target },
        status: "queued",
      });
    }
  }

  const reallocRes = (await db.execute(sql`
    UPDATE reservations
    SET status = 'cancelled', cancel_reason = 'reallocation_declined'
    WHERE status = 'confirmed' AND at_risk = true
      AND reallocation_deadline_at IS NOT NULL AND reallocation_deadline_at <= now()
    RETURNING id, renter_id, final_idr
  `)) as unknown as { rows: Array<{ id: string; renter_id: string; final_idr: string | number } | undefined> };
  const reallocCancelled = reallocRes.rows.filter(Boolean) as Array<{ id: string; renter_id: string; final_idr: string | number }>;
  summary.reallocationCancelled = reallocCancelled.length;

  for (const rc of reallocCancelled) {
    const intents = await db
      .select({ id: paymentIntents.id })
      .from(paymentIntents)
      .where(and(eq(paymentIntents.reservationId, rc.id), eq(paymentIntents.purpose, "booking")))
      .limit(1);
    const intent = intents[0];
    if (intent) {
      await db.insert(refunds).values({
        paymentIntentId: intent.id,
        reservationId: rc.id,
        amountIdr: BigInt(rc.final_idr),
        reason: "reallocation_declined",
        status: "pending",
      });
    }
  }

  return summary;
}
