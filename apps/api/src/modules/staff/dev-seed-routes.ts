/**
 * Dev-only seeding endpoint for the staff PWA offline round-trip E2E
 * (issue #66 / T-07 mirror). Non-production only. Creates 3 confirmed
 * reservations over JMB-001 commuter bikes and returns the voucher tokens /
 * bike tags the spec needs to enqueue valid checkouts.
 */
import type { FastifyInstance } from "fastify";
import { db, outlets, bikes, reservations } from "@repo/db";
import { and, eq, sql } from "@repo/db";
import { createReservationHold } from "../inventory/reservation-hold.js";
import { signVoucher } from "../../lib/voucher.js";

export function registerDevStaffSeedRoutes(app: FastifyInstance, opts: { nodeEnv: string }): void {
  if (opts.nodeEnv === "production") return;

  app.post("/api/v1/dev/staff/seed-offline-roundtrip", async (_request, reply) => {
    // Resolve JMB-001.
    const outletRows = await db.select().from(outlets).where(eq(outlets.code, "JMB-001")).limit(1);
    const outlet = outletRows[0];
    if (!outlet) throw new Error("JMB-001 outlet not seeded");

    const offset = 7 * 60 * 60_000;
    const wibNow = Date.now() + offset;
    const dayStart = Math.floor(wibNow / 86_400_000) * 86_400_000;
    let target = dayStart + 8 * 60 * 60_000;
    if (target <= wibNow) target += 86_400_000;
    const startsAt = new Date(target - offset);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);

    // Three available commuter bikes.
    const bikeRows = await db
      .select({ assetTag: bikes.assetTag })
      .from(bikes)
      .where(and(eq(bikes.currentOutletId, outlet.id), eq(bikes.category, "commuter"), eq(bikes.state, "available")))
      .limit(3);
    const bikeTags = bikeRows.map((b) => b.assetTag as string);

    const reservationsOut: Array<{
      reservationId: string;
      voucherToken: string;
      bikeAssetTag: string;
      balanceAmountIdr: number;
      startsAt: string;
    }> = [];

    for (let i = 0; i < 3; i += 1) {
      const phone = `+62899${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

      const held = await createReservationHold(
        db as never,
        {
          outletId: outlet.id,
          category: "commuter",
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        } as never,
        { kind: "guest", phone } as never,
      );

      await db.execute(sql`
        UPDATE reservations SET status = 'confirmed', confirmed_at = now()
        WHERE id = ${held.reservation.id}::uuid
      `);

      const [r] = await db.select().from(reservations).where(eq(reservations.id, held.reservation.id));
      const balance = Number((r?.finalIdr ?? 0n) - (r?.dpIdr ?? 0n));

      reservationsOut.push({
        reservationId: held.reservation.id,
        voucherToken: signVoucher({ reservationId: held.reservation.id, expiresAt: new Date(startsAt.getTime() + 60 * 60_000) }),
        bikeAssetTag: (bikeTags[i] ?? bikeTags[0] ?? ""),
        balanceAmountIdr: balance,
        startsAt: startsAt.toISOString(),
      });
    }

    // Dev-only rentals lookup helper data: return reservation ids.
    return reply.code(200).send({
      outletId: outlet.id,
      bikeTags,
      reservations: reservationsOut,
    });
  });

  // Lookup rentals by reservation ids (for verification).
  app.get("/api/v1/dev/staff/rentals", async (request, reply) => {
    const ids = String((request.query as { ids?: string }).ids ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) return reply.code(200).send({ rentals: [] });
    const rows = await db.execute(sql`
      SELECT reservation_id, checked_out_at FROM rentals
      WHERE reservation_id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
      ORDER BY checked_out_at ASC
    `);
    const rentals = (rows as unknown as { rows: Array<{ reservation_id: string; checked_out_at: string }> }).rows.map((r) => ({
      reservationId: r.reservation_id,
      checkedOutAt: new Date(r.checked_out_at).toISOString(),
    }));
    return reply.code(200).send({ rentals });
  });
}
