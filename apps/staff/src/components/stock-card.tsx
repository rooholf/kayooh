import { QUEUE_CAPACITY } from "../db/scan-events";

export interface CardFacts {
  outlet: string;
  dateLabel: string;
  category: string;
  staff: string;
}

interface StockCardProps extends CardFacts {
  queued: number;
  running: boolean;
  online: boolean;
  hasSample: boolean;
}

function syncLabel(queued: number, running: boolean, online: boolean): string {
  if (!online) return queued > 0 ? `${queued} menunggu · luring` : "Luring";
  if (running) return "Mengirim…";
  if (queued > 0) return `${queued} menunggu`;
  return "Tersinkron";
}

export function StockCard({ outlet, dateLabel, category, staff, queued, running, online, hasSample }: StockCardProps) {
  const full = queued >= QUEUE_CAPACITY;
  return (
    <section className="flex-none border-b-2 border-ink px-[14px] pb-3 pt-[11px]">
      <div className="mb-[9px] flex items-center justify-between gap-3">
        <h1 className="font-sans text-[12px] font-bold uppercase leading-none tracking-[0.15em]">
          Kartu Stok Harian
        </h1>
        <div className="flex items-center gap-2">
          {hasSample && (
            <span
              title="Baris peragaan; ganti dengan data sinkronisasi outlet"
              className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-ink/70"
            >
              Contoh
            </span>
          )}
          <span
            role="status"
            aria-live="polite"
            className={`rounded-[2px] border px-[6px] py-[3px] font-sans text-[10px] font-medium tracking-[0.04em] ${
              full
                ? "border-signal text-signal"
                : "border-rule text-rule"
            }`}
          >
            {full ? `Penuh ${queued}/${QUEUE_CAPACITY}` : syncLabel(queued, running, online)}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-[14px] gap-y-[7px]">
        <Field label="Outlet" value={outlet} />
        <Field label="Tanggal" value={dateLabel} mono />
        <Field label="Kategori" value={category} />
        <Field label="Petugas" value={staff} />
      </dl>
    </section>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="mb-[3px] font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
        {label}
      </dt>
      <dd
        className={`border-b border-line pb-[3px] ${mono ? "font-mono text-[12px] font-medium" : "font-sans text-[13px] font-semibold"}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** FR-OFF-01.1 — past 500 queued events, new scans are blocked with a warning. */
export function CapNotice({ queued }: { queued: number }) {
  if (queued < QUEUE_CAPACITY) return null;
  return (
    <div
      role="alert"
      className="flex-none border-y-2 border-signal bg-[var(--signal-tint)] px-[14px] py-2"
    >
      <p className="font-sans text-[11px] font-semibold leading-snug text-signal">
        Antrean penuh — {queued} dari {QUEUE_CAPACITY} gerakan belum tersinkron.
      </p>
      <p className="mt-0.5 font-sans text-[11px] leading-snug text-signal">
        Pindaian baru diblokir sampai antrean terkirim. Jangan tutup aplikasi.
      </p>
    </div>
  );
}
