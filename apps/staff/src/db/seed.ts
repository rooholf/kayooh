import { db, newClientEventId, type ScanEvent } from "./scan-events";
import { todayAtWib } from "../lib/time";

/**
 * Authored sample ledger — the composition the surface was chosen from.
 * Every row is flagged `synthetic` and the UI labels it; replace these with the
 * outlet's real `scan_events` once the batch endpoint is live.
 */
function sampleRows(): ScanEvent[] {
  const rows: Array<Omit<ScanEvent, "clientEventId"> & { clock: string }> = [
    {
      clock: "09:05",
      type: "checkout",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-021-CMT-118", renterPhoneMasked: "0813••••2210" },
      status: "applied",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "09:40",
      type: "checkout",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-014-RDW-207", renterPhoneMasked: "0812••••4471" },
      status: "applied",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "10:05",
      type: "checkin",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-021-CMT-118", renterPhoneMasked: "0813••••2210" },
      status: "applied",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "10:50",
      type: "bike_status_change",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-008-MTB-092", toState: "maintenance", note: "Rantai" },
      status: "applied",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "11:22",
      type: "checkout",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-027-MTB-146", renterPhoneMasked: "0812••••8890" },
      status: "applied",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "11:55",
      type: "checkout",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-019-CMT-077", renterPhoneMasked: "0813••••6620" },
      status: "applied",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "12:10",
      type: "checkout",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-027-MTB-146", renterPhoneMasked: "0812••••8890" },
      status: "rejected",
      reason: "kategori tidak cocok",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "12:48",
      type: "checkin",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-012-RDW-061", renterPhoneMasked: "0812••••7745" },
      status: "applied",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "13:35",
      type: "checkout",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-014-RDW-207", renterPhoneMasked: "0812••••4471" },
      status: "flagged",
      reason: "Voucher belum dikonfirmasi",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "14:06",
      type: "checkout",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-033-FIX-004", renterPhoneMasked: "0812••••1208" },
      status: "applied",
      attempts: 1,
      synthetic: true,
    },
    // Still queued: the chip's live count, drained by the offline sync loop.
    {
      clock: "14:12",
      type: "checkin",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-021-CMT-118", renterPhoneMasked: "0813••••2210" },
      status: "pending",
      attempts: 0,
      synthetic: true,
    },
    {
      clock: "14:18",
      type: "checkout",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-018-CMT-053", renterPhoneMasked: "0812••••3390" },
      status: "pending",
      attempts: 0,
      synthetic: true,
    },
    {
      clock: "14:23",
      type: "bike_status_change",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-008-MTB-092", toState: "available", note: "Rantai diganti" },
      status: "pending",
      attempts: 0,
      synthetic: true,
    },
  ];

  return rows.map(({ clock, ...row }) => {
    const occurredAt = todayAtWib(clock);
    const acked = row.status === "applied" || row.status === "flagged" || row.status === "rejected";
    return {
      ...row,
      clientEventId: newClientEventId(),
      occurredAt,
      ...(acked ? { receivedAt: new Date(Date.parse(occurredAt) + 45_000).toISOString() } : {}),
    };
  });
}

/** Seed once, only into an empty store. */
export async function seedSampleData(): Promise<void> {
  if ((await db.scanEvents.count()) > 0) return;
  await db.scanEvents.bulkAdd(sampleRows());
}
