import type { ScanEvent } from "../db/scan-events";
import { QUEUE_CAPACITY } from "../db/scan-events";
import { BACKOFF_MS, type SyncSnapshot } from "../sync/engine";
import { formatTime } from "../lib/time";
import { outletContext } from "../lib/boot";
import { useInstallPrompt } from "../lib/install";
import type { ReactNode } from "react";

export function PanelHeader({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex-none border-b-2 border-ink px-[14px] py-3">
      <h2 className="font-sans text-[12px] font-bold uppercase tracking-[0.14em]">{title}</h2>
      <p className="mt-[3px] font-sans text-[11px] leading-snug text-ink/70">{note}</p>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="px-[14px] py-6">
      <p className="border-2 border-dashed border-line px-3 py-6 text-center font-sans text-[12px] leading-snug text-ink/70">
        {children}
      </p>
    </div>
  );
}

function backoffLabel(snapshot: SyncSnapshot): string {
  if (snapshot.backoffStep === null) return "Siap kirim";
  const step = snapshot.backoffStep;
  const seconds = (BACKOFF_MS[step] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 0) / 1000;
  const capped = step >= BACKOFF_MS.length - 1 ? " (batas)" : "";
  return `Percobaan ke-${step + 1} · jeda ${seconds} dtk${capped}`;
}

/* ---------------------------------------------------------------- Antrean */

interface QueueViewProps {
  events: ScanEvent[];
  snapshot: SyncSnapshot;
  onRetry: () => void;
  onHealthSync: () => void;
  healthSyncing: boolean;
  driftMaxPct: number;
}

export function QueueView({
  events,
  snapshot,
  onRetry,
  onHealthSync,
  healthSyncing,
  driftMaxPct,
}: QueueViewProps) {
  const queued = events.filter((e) => e.status === "pending" || e.status === "syncing");
  const full = queued.length >= QUEUE_CAPACITY;
  const flagged = events.filter((e) => e.status === "flagged");
  const rejected = events.filter((e) => e.status === "rejected");

  return (
    <>
      <PanelHeader
        title="Antrean sinkron"
        note="Gerakan tersimpan di perangkat, terkirim berurutan menurut waktu kejadian."
      />

      <div className="flex-none border-b border-line px-[14px] py-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Stat label="Menunggu" value={`${queued.length}`} />
          <Stat label="Kapasitas" value={`${queued.length}/${QUEUE_CAPACITY}`} />
          <Stat label="Koneksi" value={snapshot.online ? "Daring" : "Luring"} />
          <Stat label="Mekanisme" value={backoffLabel(snapshot)} />
        </dl>
        <div className="mt-3 h-[6px] w-full border border-ink">
          <div
            className={`h-full ${full ? "bg-signal" : "bg-rule"}`}
            style={{ width: `${Math.min(100, (queued.length / QUEUE_CAPACITY) * 100)}%` }}
          />
        </div>
        {snapshot.driftAlert && snapshot.driftAlert.driftPct > driftMaxPct && (
          <p
            role="alert"
            className="mt-2 border-2 border-signal bg-[var(--signal-tint)] px-2 py-1 font-sans text-[11px] font-semibold leading-snug text-signal"
          >
            Selisih stok {snapshot.driftAlert.driftPct}% — lebih dari batas {driftMaxPct}%.
            Periksa hitungan fisik outlet.
          </p>
        )}
        {snapshot.lastError && (
          <p className="mt-2 font-sans text-[11px] leading-snug text-signal">
            Kirim terakhir gagal: {snapshot.lastError}
          </p>
        )}
        <button
          type="button"
          onClick={onRetry}
          disabled={!snapshot.online}
          className="mt-3 min-h-[44px] w-full border-2 border-ink font-sans text-[12px] font-semibold disabled:cursor-not-allowed disabled:border-ink/30 disabled:text-ink/40"
        >
          {snapshot.running ? "Mengirim…" : "Coba kirim sekarang"}
        </button>
        <button
          type="button"
          onClick={onHealthSync}
          disabled={healthSyncing || !snapshot.online}
          className="mt-2 min-h-[44px] w-full border-2 border-rule font-sans text-[12px] font-semibold text-rule disabled:cursor-not-allowed disabled:border-ink/30 disabled:text-ink/40"
        >
          {healthSyncing ? "Sinkron kesehatan…" : "Kirim health-sync (kancing antrean dulu)"}
        </button>
      </div>

      {(flagged.length > 0 || rejected.length > 0) && (
        <div className="flex-none border-b border-line px-[14px] py-3">
          <h3 className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
            Hasil per kejadian
          </h3>
          <ul className="mt-2 space-y-2">
            {flagged.map((event) => (
              <li
                key={`flagged-${event.clientEventId}`}
                role="alert"
                className="border-l-2 border-signal bg-[var(--signal-tint)] px-2 py-1.5 font-sans text-[11px] leading-snug text-signal"
              >
                <b className="font-mono text-[10px]">
                  SCAN_FLAGGED · {event.payload.bikeAssetTag ?? event.type}
                </b>
                <span className="block">{event.reason ?? "Perlu ditinjau"}</span>
              </li>
            ))}
            {rejected.map((event) => (
              <li
                key={`rejected-${event.clientEventId}`}
                role="alert"
                className="border-l-2 border-signal px-2 py-1.5 font-sans text-[11px] leading-snug text-signal"
              >
                <b className="font-mono text-[10px]">
                  DITOLAK · {event.payload.bikeAssetTag ?? event.type}
                </b>
                <span className="block">{event.reason ?? "Tidak berlaku"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {queued.length === 0 ? (
        <Empty>Antrean kosong. Semua gerakan sudah tersinkron.</Empty>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {queued.map((event) => (
            <li key={event.clientEventId} className="border-b border-line px-[14px] py-[10px]">
              <div className="flex items-baseline justify-between gap-3">
                <b className="font-mono text-[12px] font-semibold">
                  {event.payload.bikeAssetTag ?? event.payload.bikeAssetTags?.[0] ?? event.type}
                </b>
                <span className="font-mono text-[10px] text-ink/70">
                  {formatTime(event.occurredAt)}
                </span>
              </div>
              <p className="mt-[2px] font-sans text-[11px] text-ink/70">
                {event.type === "checkout"
                  ? "Serah terima"
                  : event.type === "checkin"
                    ? "Pengembalian"
                    : event.type === "bike_status_change"
                      ? "Ubah status"
                      : event.type === "inspection"
                        ? "Pemeriksaan"
                        : "Insiden"}
                {" · "}
                {event.status === "syncing" ? "mengirim" : `percobaan ${event.attempts}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- Periksa */

interface Inspection {
  assetTag: string;
  at: string;
  note: string;
}

function inspectionsOf(events: ScanEvent[]): Inspection[] {
  const applied = events
    .filter((e) => e.status === "applied")
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  const open = new Map<string, Inspection>();
  for (const event of applied) {
    const tag = event.payload.bikeAssetTag;
    if (!tag) continue;
    if (event.type === "checkin") {
      open.set(tag, { assetTag: tag, at: event.occurredAt, note: "Baru kembali dari rental" });
    } else if (event.type === "checkout" || event.type === "inspection") {
      open.delete(tag);
    } else if (event.type === "bike_status_change") {
      // Any applied staff status move (available/maintenance/unavailable)
      // clears the pending-inspection hold.
      open.delete(tag);
    }
  }
  return [...open.values()].reverse();
}

export function InspectionsView({ events }: { events: ScanEvent[] }) {
  const inspections = inspectionsOf(events);
  return (
    <>
      <PanelHeader
        title="Menunggu pemeriksaan"
        note="Sepeda yang baru kembali sebelum masuk kembali ke stok siap."
      />
      {inspections.length === 0 ? (
        <Empty>Tidak ada sepeda menunggu pemeriksaan.</Empty>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {inspections.map((item) => (
            <li
              key={item.assetTag}
              className="flex items-center justify-between border-b border-line px-[14px] py-[10px]"
            >
              <span>
                <b className="block font-mono text-[12px] font-semibold">{item.assetTag}</b>
                <span className="font-sans text-[11px] text-ink/70">{item.note}</span>
              </span>
              <span className="font-mono text-[10px] text-ink/70">{formatTime(item.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ Akun */

export function AccountView({
  queued,
  snapshot,
}: {
  queued: number;
  snapshot: SyncSnapshot;
}) {
  const { outlet, staff, shift, openingBalance } = outletContext;
  const { canInstall, install } = useInstallPrompt();
  return (
    <>
      <PanelHeader title="Akun & shift" note="Satu outlet, satu petugas per shift." />
      <dl className="grid flex-none grid-cols-2 gap-x-4 gap-y-3 border-b border-line px-[14px] py-3">
        <Stat label="Petugas" value={staff} />
        <Stat label="Outlet" value={outlet} />
        <Stat label="Shift" value={`${shift.name} · ${shift.start}–${shift.end}`} />
        <Stat label="Saldo awal" value={`${openingBalance} sepeda`} />
        <Stat label="Antrean" value={`${queued}/${QUEUE_CAPACITY}`} />
        <Stat label="Koneksi" value={snapshot.online ? "Daring" : "Luring"} />
      </dl>
      <div className="flex-none px-[14px] py-3">
        {canInstall ? (
          <button
            type="button"
            onClick={() => void install()}
            className="min-h-[44px] w-full border-2 border-rule bg-rule px-3 font-sans text-[12px] font-semibold tracking-[0.02em] text-card"
          >
            Pasang aplikasi di perangkat ini
          </button>
        ) : (
          <p className="font-sans text-[11px] leading-relaxed text-ink/70">
            Aplikasi ini dapat dipasang ke layar utama lewat menu tautan browser
            (“Pasang aplikasi” / “Tambah ke layar beranda”). Setelah dipasang, shell
            aplikasi tersimpan di perangkat sehingga pindaian tetap berjalan tanpa
            jaringan.
          </p>
        )}
      </div>
      <p className="flex-none px-[14px] pb-4 font-sans text-[10px] leading-relaxed text-ink/70">
        Nilai pemeriksaan, jumlah foto, dan tenggang waktu akan dibaca dari konfigurasi
        server. Sementara ini nilai bawaan di perangkat yang dipakai sampai endpoint
        konfigurasi tersambung.
      </p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
        {label}
      </dt>
      <dd className="mt-[2px] font-mono text-[12px] font-medium leading-snug">{value}</dd>
    </div>
  );
}
