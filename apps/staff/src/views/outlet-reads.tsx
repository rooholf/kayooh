import { useCallback, useEffect, useRef, useState } from "react";
import type { StaffOverdueItem } from "@repo/contracts";
import {
  fetchExpectedRentals,
  fetchOverdueRentals,
  fetchOutletBikes,
  type OutletBikesPage,
} from "../api/client";
import { staffConfig } from "../lib/config";
import { useOutletRead } from "../lib/use-outlet-read";
import { formatDate, formatTime, todayWibDate } from "../lib/time";
import { Empty, PanelHeader } from "./panels";

/**
 * The three SRS 7.2 outlet reads (plan A.4.6 / A.4.7 / A.4.8). Each lists
 * server-sourced data, degrades to the last cached copy offline (stale flag),
 * and keeps the renter phone masked — staff never see a full number here.
 */

interface ReadMeta {
  fetchedAt: string | null;
  stale: boolean;
  error: string | null;
  loading: boolean;
}

/** One-line freshness/error strip shared by the read panels. */
function ReadStatus({ fetchedAt, stale, error, loading }: ReadMeta) {
  if (error) {
    return (
      <p role="status" className="px-[14px] pt-2 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-signal">
        {error}
      </p>
    );
  }
  if (loading && !fetchedAt) {
    return (
      <p className="px-[14px] pt-2 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink/50">
        Memuat…
      </p>
    );
  }
  if (!fetchedAt) return null;
  return (
    <p className="px-[14px] pt-2 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink/50">
      {stale ? "Tersimpan luring · " : ""}
      Per {formatDate(new Date(fetchedAt))} {formatTime(fetchedAt)}
    </p>
  );
}

/** Minutes a rental has been overdue as of now (0 when still inside). */
function minutesOverdue(expectedEndAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(expectedEndAt).getTime()) / 60_000));
}

function formatOverdue(minutes: number): string {
  if (minutes < 60) return `${minutes} mtk`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} jam` : `${hours} j ${rest} mtk`;
}

/* ---------------------------------------------------------------- Lewat */

export function OverdueView() {
  const { payload, fetchedAt, stale, error, loading } = useOutletRead(
    "overdue",
    fetchOverdueRentals,
    [],
  );
  const items = payload ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title="Lewat jatuh tempo"
        note="Rental terbuka yang lewat expected end. Petugas menelepon mulai tahap 2."
      />
      <ReadStatus fetchedAt={fetchedAt} stale={stale} error={error} loading={loading} />
      {items.length === 0 ? (
        <Empty>
          {error
            ? "Belum ada data lewat jatuh tempo yang tercatat di perangkat."
            : "Tidak ada rental lewat jatuh tempo."}
        </Empty>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {items.map((item) => (
            <OverdueRow key={item.rentalId} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OverdueRow({ item }: { item: StaffOverdueItem }) {
  const [called, setCalled] = useState(false);
  const canCall = item.escalationStage >= 2;
  const stageLabel =
    staffConfig.escalationStageLabels[item.escalationStage] ?? `Tahap ${item.escalationStage}`;
  const overdue = minutesOverdue(item.expectedEndAt);

  return (
    <li className="border-b border-line px-[14px] py-[10px]">
      <div className="flex items-baseline justify-between gap-3">
        <b className="font-mono text-[12px] font-semibold">{item.bikeAssetTag}</b>
        <span
          className={`rounded-[2px] border px-[6px] py-[3px] font-mono text-[9px] font-medium uppercase tracking-[0.12em] ${
            canCall ? "border-signal text-signal" : "border-rule text-rule"
          }`}
        >
          Tahap {item.escalationStage}
        </span>
      </div>
      <p className="mt-[3px] font-sans text-[11px] leading-snug text-ink/70">
        Seharusnya {formatDate(new Date(item.expectedEndAt))} {formatTime(item.expectedEndAt)}
        {overdue > 0 ? ` · lewat ${formatOverdue(overdue)}` : ""}
      </p>
      <p className="mt-[3px] font-mono text-[10px] text-ink/60">{item.renterPhoneMasked}</p>
      <p className="mt-[2px] break-all font-mono text-[9px] text-ink/40" title="ID rental — dipakai untuk pemeriksaan">
        {item.rentalId}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-sans text-[10px] text-ink/70">{stageLabel}</span>
        {canCall ? (
          <button
            type="button"
            onClick={() => setCalled((v) => !v)}
            className={`min-h-[44px] border-2 px-3 font-sans text-[11px] font-semibold ${
              called ? "border-rule bg-rule text-card" : "border-ink bg-transparent text-ink"
            }`}
          >
            {called ? "Sudah ditelepon" : "Hubungi renter"}
          </button>
        ) : (
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink/40">
            Belum tahap telepon
          </span>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------ Terjadwal */

export function ExpectedView() {
  const [date, setDate] = useState(() => todayWibDate());
  const { payload, fetchedAt, stale, error, loading } = useOutletRead(
    `expected:${date}`,
    () => fetchExpectedRentals(date),
    [date],
  );
  const items = payload ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title="Terjadwal"
        note="Reservasi yang mulai pada tanggal terpilih (WIB). Telepon renter disamarkan."
      />
      <div className="flex-none px-[14px] py-2">
        <label className="flex items-center justify-between gap-3 font-sans text-[12px]">
          <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
            Tanggal
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="min-h-[44px] border-b-2 border-line bg-transparent font-mono text-[12px] outline-none focus:border-rule"
          />
        </label>
      </div>
      <ReadStatus fetchedAt={fetchedAt} stale={stale} error={error} loading={loading} />
      {items.length === 0 ? (
        <Empty>
          {error
            ? "Belum ada data terencana yang tercatat di perangkat."
            : "Tidak ada reservasi terjadwal untuk tanggal itu."}
        </Empty>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {items.map((item) => (
            <li key={item.reservationId} className="border-b border-line px-[14px] py-[10px]">
              <div className="flex items-baseline justify-between gap-3">
                <b className="font-sans text-[13px] font-semibold">{item.category}</b>
                <span className="font-mono text-[10px] text-ink/60">{item.quantity} sepeda</span>
              </div>
              <p className="mt-[3px] font-mono text-[10px] text-ink/70">
                {formatTime(item.startsAt)} – {formatTime(item.endsAt)} · {item.renterPhoneMasked}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Sepeda */

const BIKE_STATE_LABEL: Record<string, string> = {
  available: "Siap",
  in_rental: "Disewa",
  pending_inspection: "Menunggu periksa",
  maintenance: "Perawatan",
  unavailable: "Tidak tersedia",
  charging: "Mengisi daya",
};

/** The server-sourced bike list (plan A.4.8): state/category filter + cursor
 * pagination. Pages accumulate into one scroll; a fresh filter resets it. */
export function BikesView() {
  const [state, setState] = useState("");
  const [category, setCategory] = useState("");
  const [items, setItems] = useState<OutletBikesPage["items"]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const itemsRef = useRef<OutletBikesPage["items"]>([]);

  const load = useCallback(
    async (cursor?: string, append: boolean = false) => {
      setLoading(true);
      const result = await fetchOutletBikes({
        state: state || undefined,
        category: category || undefined,
        cursor,
      });
      if (result.payload) {
        const merged = append ? [...itemsRef.current, ...result.payload.items] : result.payload.items;
        itemsRef.current = merged;
        setItems(merged);
        setNextCursor(result.payload.nextCursor);
        setFetchedAt(result.fetchedAt);
        setStale(result.fromCache);
        setError(null);
      } else {
        setNextCursor(null);
        setError(result.error);
        if (!append) itemsRef.current = [];
      }
      setLoading(false);
    },
    [state, category],
  );

  useEffect(() => {
    itemsRef.current = [];
    setItems([]);
    setNextCursor(null);
    void load(undefined, false);
  }, [load]);

  return (
    <section className="flex flex-none flex-col border-b-2 border-ink">
      <div className="flex-none border-b border-line px-[14px] py-3">
        <h2 className="font-sans text-[12px] font-bold uppercase tracking-[0.14em]">
          Sepeda di outlet
        </h2>
        <p className="mt-[3px] font-sans text-[11px] leading-snug text-ink/70">
          Dari server · saring status / kategori, muat halaman berikutnya.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="font-sans text-[12px]">
            <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
              Status
            </span>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="mt-1 min-h-[44px] w-full border-b-2 border-line bg-transparent py-[8px] outline-none focus:border-rule"
            >
              <option value="">Semua</option>
              {Object.entries(BIKE_STATE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="font-sans text-[12px]">
            <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
              Kategori
            </span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value.trim())}
              placeholder="cth. commuter"
              autoComplete="off"
              spellCheck={false}
              className="mt-1 min-h-[44px] w-full border-b-2 border-line bg-transparent py-[8px] font-mono text-[12px] outline-none focus:border-rule"
            />
          </label>
        </div>
        <ReadStatus fetchedAt={fetchedAt} stale={stale} error={error} loading={loading} />
      </div>

      {items.length === 0 ? (
        <Empty>{error ? "Luring — data tidak tersedia." : "Tidak ada sepeda yang cocok."}</Empty>
      ) : (
        <ul className="max-h-[180px] overflow-y-auto">
          {items.map((bike) => (
            <li
              key={bike.bikeId}
              className="flex items-center justify-between border-b border-line px-[14px] py-[10px]"
            >
              <span>
                <b className="block font-mono text-[12px] font-semibold">{bike.assetTag}</b>
                <span className="font-sans text-[11px] text-ink/70">{bike.category}</span>
              </span>
              <span
                className={`rounded-[2px] border px-[6px] py-[3px] font-mono text-[9px] font-medium uppercase tracking-[0.12em] ${
                  bike.state === "available" ? "border-rule text-rule" : "border-signal text-signal"
                }`}
              >
                {BIKE_STATE_LABEL[bike.state] ?? bike.state}
              </span>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <div className="flex-none border-t border-line px-[14px] py-2">
          <button
            type="button"
            onClick={() => void load(nextCursor, true)}
            disabled={loading}
            className="min-h-[44px] w-full border-2 border-ink font-sans text-[12px] font-semibold disabled:cursor-not-allowed disabled:border-ink/30 disabled:text-ink/40"
          >
            {loading ? "Memuat…" : "Muat sepeda berikutnya"}
          </button>
        </div>
      )}
    </section>
  );
}
