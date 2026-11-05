import { vAssetTag } from "@repo/contracts";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { BikeState, EventType } from "../db/scan-events";
import { staffConfig } from "../lib/config";

export type ScanMode = "checkout" | "checkin" | "incident" | "bike_status_change";

export interface ScanDraft {
  type: EventType;
  assetTag: string;
  voucherToken?: string;
  note?: string;
  toState?: BikeState;
  checklist?: Record<string, boolean>;
}

const MODES: Array<{ id: ScanMode; label: string }> = [
  { id: "checkout", label: "Serah terima" },
  { id: "checkin", label: "Pengembalian" },
  { id: "incident", label: "Insiden" },
  { id: "bike_status_change", label: "Ubah status" },
];

const STATES: BikeState[] = ["available", "maintenance", "unavailable", "charging"];

const STATE_LABEL: Record<string, string> = {
  available: "Siap",
  maintenance: "Perawatan",
  unavailable: "Tidak tersedia",
  charging: "Mengisi daya",
};

interface ScanSheetProps {
  mode: ScanMode;
  focus?: "voucher" | "tag";
  blocked: boolean;
  onClose: () => void;
  onSubmit: (draft: ScanDraft) => void;
}

export function ScanSheet({ mode, focus = "voucher", blocked, onClose, onSubmit }: ScanSheetProps) {
  const [current, setCurrent] = useState<ScanMode>(mode);
  const [assetTag, setAssetTag] = useState("");
  const [voucher, setVoucher] = useState("");
  const [note, setNote] = useState("");
  const [toState, setToState] = useState<BikeState>("maintenance");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tagOk = vAssetTag.safeParse(assetTag.trim()).success;
  const noteOk = current !== "incident" || note.trim().length >= 4;
  const voucherOk = current !== "checkout" || voucher.trim().length >= 4;
  const canSubmit = tagOk && noteOk && voucherOk && !blocked;

  const reason = useMemo(() => {
    if (blocked) return "Antrean penuh — pindaian baru diblokir.";
    if (assetTag.trim().length > 0 && !tagOk) return "Kode sepeda harus berformat JMB-000-XXX-000.";
    if (!voucherOk) return "Isi token voucher renter.";
    if (!noteOk) return "Tulis catatan singkat untuk insiden.";
    return null;
  }, [blocked, assetTag, tagOk, voucherOk, noteOk]);

  function submit() {
    if (!canSubmit) return;
    onSubmit({
      type: current,
      assetTag: assetTag.trim(),
      ...(current === "checkout" ? { voucherToken: voucher.trim(), checklist } : {}),
      ...(current === "incident" ? { note: note.trim() } : {}),
      ...(current === "bike_status_change" ? { note: note.trim(), toState } : {}),
    });
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-ink/35">
      <button
        type="button"
        aria-label="Tutup panel"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <form
        aria-label="Catat gerakan sepeda"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="relative max-h-[86%] overflow-y-auto border-t-2 border-ink bg-card"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-card px-[14px] py-[10px]">
          <h2 className="font-sans text-[12px] font-bold uppercase tracking-[0.14em]">
            Catat gerakan
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-2 font-sans text-[12px] font-semibold text-rule"
          >
            Batal
          </button>
        </div>

        <div className="px-[14px] py-3">
          <div className="grid grid-cols-2 gap-[6px]">
            {MODES.map((option) => {
              const selected = option.id === current;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setCurrent(option.id)}
                  className={`min-h-[44px] border-2 px-2 font-sans text-[12px] font-semibold ${
                    selected
                      ? "border-rule bg-rule text-card"
                      : "border-ink bg-transparent text-ink"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {current === "checkout" && (
            <Labelled label="Token voucher renter" hint="Dari QR milik renter">
              <input
                value={voucher}
                onChange={(e) => setVoucher(e.target.value)}
                autoFocus={focus === "voucher"}
                autoComplete="off"
                spellCheck={false}
                placeholder="vch_••••••"
                className="w-full border-b-2 border-line bg-transparent py-[10px] font-mono text-[14px] outline-none focus:border-rule"
              />
            </Labelled>
          )}

          <Labelled label="Kode sepeda" hint="Pindai tag atau ketik kodenya">
            <input
              value={assetTag}
              onChange={(e) => setAssetTag(e.target.value.toUpperCase())}
              autoFocus={focus === "tag"}
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              placeholder="JMB-021-CMT-118"
              className="w-full border-b-2 border-line bg-transparent py-[10px] font-mono text-[14px] uppercase outline-none focus:border-rule"
            />
          </Labelled>

          {current === "bike_status_change" && (
            <Labelled label="Status baru" hint="Staf tidak dapat mengubah ke Siap tanpa pemeriksaan">
              <select
                value={toState}
                onChange={(e) => setToState(e.target.value as BikeState)}
                className="w-full border-b-2 border-line bg-transparent py-[10px] font-sans text-[14px] outline-none focus:border-rule"
              >
                {STATES.map((state) => (
                  <option key={state} value={state}>
                    {STATE_LABEL[state] ?? state}
                  </option>
                ))}
              </select>
            </Labelled>
          )}

          {(current === "incident" || current === "bike_status_change") && (
            <Labelled label="Catatan" hint="Sesingkat mungkin — ini muncul di kartu">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder={current === "incident" ? "Rantai lepas di jalan" : "Rantai diganti"}
                className="w-full resize-none border-b-2 border-line bg-transparent py-[8px] font-sans text-[14px] outline-none focus:border-rule"
              />
            </Labelled>
          )}

          {current === "checkout" && (
            <fieldset className="mt-4">
              <legend className="mb-2 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
                Pemeriksaan kondisi · {staffConfig.minPhotos}–{staffConfig.maxPhotos} foto
              </legend>
              {staffConfig.checklistItems.map((item) => (
                <label
                  key={item}
                  className="flex min-h-[44px] items-center gap-3 border-b border-line font-sans text-[13px]"
                >
                  <input
                    type="checkbox"
                    checked={checklist[item] ?? false}
                    onChange={(e) =>
                      setChecklist((prev) => ({ ...prev, [item]: e.target.checked }))
                    }
                    className="h-[18px] w-[18px] accent-[var(--rule)]"
                  />
                  {item}
                </label>
              ))}
            </fieldset>
          )}
        </div>

        <div className="sticky bottom-0 border-t-2 border-ink bg-card px-[14px] py-3">
          {reason && (
            <p role="alert" className="mb-2 font-sans text-[11px] font-medium text-signal">
              {reason}
            </p>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            className="min-h-[48px] w-full border-2 border-rule bg-rule font-sans text-[13px] font-semibold text-card disabled:cursor-not-allowed disabled:border-ink/30 disabled:bg-transparent disabled:text-ink/40"
          >
            Simpan ke antrean
          </button>
          <p className="mt-2 text-center font-sans text-[10px] text-ink/70">
            Tersimpan di perangkat dulu; terkirim saat koneksi tersedia.
          </p>
        </div>
      </form>
    </div>
  );
}

function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <label className="mt-4 block">
      <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
        {label}
      </span>
      {children}
      <span className="mt-1 block font-sans text-[10px] text-ink/70">{hint}</span>
    </label>
  );
}
