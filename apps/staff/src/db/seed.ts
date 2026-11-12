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
      payload: { bikeAssetTags: ["JMB-021-CMT-118"] },
      status: "applied",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "09:40",
      type: "checkout",
      occurredAt: "",
      payload: { bikeAssetTags: ["JMB-014-RDW-207"] },
      status: "applied",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "10:05",
      type: "checkin",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-021-CMT-118" },
      status: "applied",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "10:50",
      type: "bike_status_change",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-008-MTB-092", to: "maintenance", reason: "Rantai dan gir aus, harus diganti" },
      status: "applied",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "11:22",
      type: "checkout",
      occurredAt: "",
      payload: { bikeAssetTags: ["JMB-027-MTB-146"] },
      status: "applied",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "11:55",
      type: "checkout",
      occurredAt: "",
      payload: { bikeAssetTags: ["JMB-019-CMT-077"] },
      status: "applied",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "12:10",
      type: "checkout",
      occurredAt: "",
      payload: { bikeAssetTags: ["JMB-027-MTB-146"] },
      status: "rejected",
      reason: "NO_OPEN_RESERVATION",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "12:48",
      type: "checkin",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-012-RDW-061" },
      status: "applied",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "13:35",
      type: "checkout",
      occurredAt: "",
      payload: { bikeAssetTags: ["JMB-014-RDW-207"] },
      status: "flagged",
      reason: "COLLATERAL_REQUIRED",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "14:06",
      type: "checkout",
      occurredAt: "",
      payload: { bikeAssetTags: ["JMB-033-FIX-004"] },
      status: "applied",
      attempts: 1,
      synthetic: true,
    },
    {
      clock: "14:12",
      type: "checkin",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-021-CMT-118" },
      status: "pending",
      attempts: 0,
      synthetic: true,
    },
    {
      clock: "14:18",
      type: "checkout",
      occurredAt: "",
      payload: { bikeAssetTags: ["JMB-018-CMT-053"] },
      status: "pending",
      attempts: 0,
      synthetic: true,
    },
    {
      clock: "14:23",
      type: "bike_status_change",
      occurredAt: "",
      payload: { bikeAssetTag: "JMB-008-MTB-092", to: "available", reason: "Rantai dan gir sudah diganti" },
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
