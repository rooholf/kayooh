import type { LedgerRow } from "../lib/ledger";

const GRID = "grid grid-cols-[44px_1fr_34px_34px_60px]";

const TONE_CLASS: Record<LedgerRow["tone"], string> = {
  normal: "",
  correction: "text-signal [&_*]:text-signal [text-decoration-line:line-through]",
  flagged: "bg-[var(--signal-tint)]",
  pending: "text-ink/70",
};

export function LedgerBoard({ rows }: { rows: LedgerRow[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-[12px]">
      <div
        className={`${GRID} ruled h-[26px] flex-none items-center border-b-2 border-ink font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-rule`}
      >
        <span className="px-[5px]">Tanggal</span>
        <span className="px-[5px]">Keterangan</span>
        <span className="px-[5px] text-right">Masuk</span>
        <span className="px-[5px] text-right">Keluar</span>
        <span className="sisa-col px-[5px] text-right">Sisa</span>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {rows.map((row) => (
          <LedgerLine key={row.key} row={row} />
        ))}
      </ul>
    </div>
  );
}

function LedgerLine({ row }: { row: LedgerRow }) {
  const dim = row.tone === "pending";
  return (
    <li
      className={`${GRID} ruled relative ${TONE_CLASS[row.tone]} ${
        row.posted ? "posted-in border-y-2 border-ink" : "border-b border-line"
      }`}
    >
      <span className="flex flex-col justify-center px-[5px] py-[6px] font-mono text-[10px] leading-none text-ink/70">
        {row.time}
      </span>

      <span className="flex flex-col justify-center gap-[2px] px-[5px] py-[6px]">
        <b className="font-mono text-[10.5px] font-semibold leading-tight">{row.title}</b>
        <span
          className={`text-[11px] leading-tight ${
            row.tone === "flagged" || row.tone === "correction" ? "text-signal" : "text-ink/75"
          }`}
        >
          {row.detail}
          {dim && <span className="ml-1 font-mono text-[9px] uppercase tracking-[0.1em]">· menunggu</span>}
        </span>
      </span>

      <span
        className={`flex items-end justify-end px-[5px] py-[6px] text-right font-mono text-[12px] ${
          row.tone === "flagged" || row.tone === "correction" ? "text-signal" : ""
        }`}
      >
        {row.masuk}
      </span>
      <span
        className={`flex items-end justify-end px-[5px] py-[6px] text-right font-mono text-[12px] ${
          row.tone === "flagged" || row.tone === "correction" ? "text-signal" : ""
        }`}
      >
        {row.keluar}
      </span>

      <span
        className={`sisa-col flex flex-col items-end justify-center px-[5px] py-[6px] text-right font-mono leading-none ${
          row.posted ? "text-rule" : ""
        } ${dim ? "border-b border-dotted border-ink/40" : ""}`}
      >
        {row.posted ? (
          <>
            <b className="text-[20px] font-bold">{row.sisa}</b>
            {row.syncedAt && (
              <i className="mt-[2px] font-mono text-[8px] font-medium not-italic">
                Tersinkron {row.syncedAt}
              </i>
            )}
          </>
        ) : (
          <span className="text-[13px] font-bold">{row.sisa}</span>
        )}
      </span>

      {row.stamp && (
        <span className="pointer-events-none absolute right-[66px] top-1/2 -translate-y-1/2 -rotate-[5deg] rounded-[2px] border-[1.5px] border-signal px-[5px] py-[3px] font-mono text-[9px] font-bold tracking-[0.14em] text-signal">
          {row.stamp}
        </span>
      )}
    </li>
  );
}
