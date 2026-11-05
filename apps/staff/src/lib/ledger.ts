import type { ScanEvent } from "../db/scan-events";
import { formatTime } from "./time";

export type RowTone = "normal" | "correction" | "flagged" | "pending";

export interface LedgerRow {
  key: string;
  time: string;
  title: string;
  detail: string;
  masuk: string;
  keluar: string;
  sisa: number;
  tone: RowTone;
  /** The last row the server has confirmed; the balance it lands on is the verdict. */
  posted: boolean;
  stamp?: string;
  /** Server receipt time of the posted row ("Tersinkron 14:06"). */
  syncedAt?: string;
}

/** How an action moves the outlet's available stock. */
export function movement(event: ScanEvent): { masuk: number; keluar: number } {
  switch (event.type) {
    case "checkin":
      return { masuk: 1, keluar: 0 };
    case "checkout":
      return { masuk: 0, keluar: 1 };
    case "bike_status_change": {
      const to = event.payload.toState;
      if (to === "available") return { masuk: 1, keluar: 0 };
      if (to === "maintenance" || to === "unavailable" || to === "charging") {
        return { masuk: 0, keluar: 1 };
      }
      return { masuk: 0, keluar: 0 };
    }
    default:
      return { masuk: 0, keluar: 0 };
  }
}

function title(event: ScanEvent): string {
  if (event.type === "incident") return "INSIDEN";
  return event.payload.bikeAssetTag ?? "—";
}

function detail(event: ScanEvent): string {
  const phone = event.payload.renterPhoneMasked;
  const note = event.payload.note;
  switch (event.type) {
    case "checkout":
      return phone ? `Serah terima · ${phone}` : "Serah terima";
    case "checkin":
      return phone ? `Pengembalian · ${phone}` : "Pengembalian";
    case "bike_status_change":
      return event.payload.toState === "available"
        ? `Kembali siap · ${note ?? "tanpa catatan"}`
        : `Masuk perawatan · ${note ?? "tanpa catatan"}`;
    case "inspection":
      return `Pemeriksaan · ${note ?? "kondisi dicatat"}`;
    case "incident":
      return `Laporan · ${note ?? "perlu tindak lanjut"}`;
  }
}

/**
 * FR-OFF-01 — the day's card. `Sisa` advances only on **applied** events: a
 * flagged, rejected, or still-queued line is shown but never moves the balance,
 * so the number in the column is what the server has actually confirmed.
 */
export function buildLedger(events: ScanEvent[], opening: number): LedgerRow[] {
  const ordered = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const rows: LedgerRow[] = [];

  const openingTime = ordered[0] ? formatTime(ordered[0].occurredAt) : "08:00";
  rows.push({
    key: "__saldo_awal",
    time: openingTime,
    title: "SALDO AWAL",
    detail: `${opening} sepeda siap`,
    masuk: String(opening),
    keluar: "—",
    sisa: opening,
    tone: "normal",
    posted: false,
  });

  let balance = opening;
  let lastAppliedKey: string | null = null;

  for (const event of ordered) {
    const move = movement(event);
    const applied = event.status === "applied";
    if (applied) {
      balance += move.masuk - move.keluar;
      lastAppliedKey = event.clientEventId;
    }

    const tone: RowTone =
      event.status === "rejected"
        ? "correction"
        : event.status === "flagged"
          ? "flagged"
          : event.status === "applied"
            ? "normal"
            : "pending";

    const showsMovement = applied || tone === "pending";

    rows.push({
      key: event.clientEventId,
      time: formatTime(event.occurredAt),
      title: title(event),
      detail:
        tone === "correction"
          ? `Ditolak · ${event.reason ?? "tidak berlaku"}`
          : tone === "flagged"
            ? (event.reason ?? "Perlu ditinjau")
            : detail(event),
      masuk: showsMovement ? (move.masuk > 0 ? String(move.masuk) : "—") : "—",
      keluar: showsMovement ? (move.keluar > 0 ? String(move.keluar) : "—") : "—",
      sisa: balance,
      tone,
      posted: false,
      ...(tone === "flagged" ? { stamp: "DICATAT" } : {}),
    });
  }

  const syncedAt = receivedAtOf(ordered, lastAppliedKey);
  return rows.map((row) =>
    row.key === lastAppliedKey
      ? { ...row, posted: true, ...(syncedAt ? { syncedAt } : {}) }
      : row,
  );
}

function receivedAtOf(events: ScanEvent[], key: string | null): string | undefined {
  if (!key) return undefined;
  const event = events.find((e) => e.clientEventId === key);
  return event?.receivedAt ? formatTime(event.receivedAt) : undefined;
}
