import { vAssetTag, vPhotoKey } from "@repo/contracts";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { BikeState, ChecklistStatus, EventType } from "../db/scan-events";
import { staffConfig } from "../lib/config";
import { tagHmacPrecheck, verifyVoucherOffline, type TagHmacConfig } from "../lib/voucher";

/** FR-SEC-01.3: tag HMAC pre-check key material (build-time env, see config). */
const TAG_HMAC_CFG: TagHmacConfig = {
  keyId: staffConfig.tagHmac.keyId,
  secret: staffConfig.tagHmac.secret,
  revokedKeyIds: staffConfig.tagHmac.revokedKeyIds,
};

export type ScanMode = "checkout" | "checkin" | "incident" | "bike_status_change";

export interface ScanDraft {
  type: EventType;
  assetTags: string[];
  voucherToken?: string;
  note?: string;
  toState?: BikeState;
  checklist?: Record<string, ChecklistStatus>;
  photoKeys?: string[];
  collateral?: { type: "ktp" | "sim" | "vehicle"; reference: string };
  balanceCollection?: { amountIdr: number; method: "cash" | "qris" };
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

const CHECKLIST_OPTIONS: Array<{ value: ChecklistStatus; label: string }> = [
  { value: "ok", label: "OK" },
  { value: "minor_issue", label: "Masalah kecil" },
  { value: "damaged", label: "Rusak" },
];

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
  const [assetTags, setAssetTags] = useState<string[]>([""]);
  const [collateralType, setCollateralType] = useState<"ktp" | "sim" | "vehicle">("ktp");
  const [collateralRef, setCollateralRef] = useState("");
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceMethod, setBalanceMethod] = useState<"cash" | "qris">("cash");
  const [voucher, setVoucher] = useState("");
  const [note, setNote] = useState("");
  const [toState, setToState] = useState<BikeState>("maintenance");
  const [checklist, setChecklist] = useState<Record<string, ChecklistStatus>>(() =>
    Object.fromEntries(staffConfig.checklistItems.map((item) => [item, "ok" as ChecklistStatus])),
  );
  const [photoKeys, setPhotoKeys] = useState<string[]>([""]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cleanedAssetTags = assetTags.map((t) => t.trim().toUpperCase()).filter((t) => t.length > 0);
  const tagOk =
    current === "checkout"
      ? cleanedAssetTags.length >= 1 && cleanedAssetTags.every((t) => vAssetTag.safeParse(t).success)
      : vAssetTag.safeParse(assetTag.trim()).success;
  const noteOk = current !== "incident" || note.trim().length >= 4;
  const voucherOk =
    current !== "checkout" ||
    (voucher.trim().length >= 4 && voucher.trim().length <= staffConfig.voucherTokenMaxLength);
  const collateralOk =
    current !== "checkout" ||
    (collateralRef.trim().length >= 1 && collateralRef.trim().length <= 200);
  const balanceOk =
    current !== "checkout" ||
    /^\d+$/.test(balanceAmount.trim()) && Number(balanceAmount.trim()) >= 0;
  const checklistOk =
    current !== "checkout" ||
    staffConfig.checklistItems.every((item) => {
      const v = checklist[item];
      return v === "ok" || v === "minor_issue" || v === "damaged";
    });
  const cleanedPhotoKeys = photoKeys.map((k) => k.trim()).filter((k) => k.length > 0);
  const photoKeysOk =
    current !== "checkout" ||
    (cleanedPhotoKeys.length >= staffConfig.minPhotos &&
      cleanedPhotoKeys.length <= staffConfig.maxPhotos &&
      cleanedPhotoKeys.every((k) => vPhotoKey.safeParse(k).success));
  const canSubmit =
    tagOk &&
    noteOk &&
    voucherOk &&
    collateralOk &&
    balanceOk &&
    checklistOk &&
    photoKeysOk &&
    !blocked;

  /* Offline pre-checks (FR-SEC-01, plan A.3): advisory only — the queue
     records the event regardless; the server re-verifies on sync. */
  const voucherPrecheck = useMemo(() => {
    const token = voucher.trim();
    if (current !== "checkout" || token.length < 8) return null;
    return verifyVoucherOffline(token, Date.now());
  }, [voucher, current]);
  const tagPrechecks =
    current === "checkout" ? cleanedAssetTags.map((tag) => tagHmacPrecheck(tag, TAG_HMAC_CFG)) : [];
  const tagsVerified = tagPrechecks.filter((v) => v.ok).length;
  const tagsProblem = tagPrechecks.filter(
    (v) => !v.ok && (v.code === "TAG_HMAC_MISMATCH" || v.code === "TAG_REVOKED_KEY"),
  ).length;

  const reason = useMemo(() => {
    if (blocked) return "Antrean penuh — pindaian baru diblokir.";
    if (assetTag.trim().length > 0 && !tagOk) return "Kode sepeda harus berformat JMB-000-XXX-000.";
    if (current === "checkout" && !voucherOk) return "Isi token voucher renter.";
    if (current === "checkout" && !collateralOk) return "Isi referensi jaminan (KTP/SIM/kendaraan).";
    if (current === "checkout" && !balanceOk) return "Isi nominal saldo yang dikumpulkan.";
    if (current === "checkout" && !checklistOk) return "Lengkapi semua 6 item pemeriksaan.";
    if (current === "checkout" && !photoKeysOk) {
      if (cleanedPhotoKeys.length < staffConfig.minPhotos) return `Minimal ${staffConfig.minPhotos} foto.`;
      if (cleanedPhotoKeys.length > staffConfig.maxPhotos) return `Maksimal ${staffConfig.maxPhotos} foto.`;
      return "Kunci foto tidak valid.";
    }
    if (!noteOk) return "Tulis catatan singkat untuk insiden.";
    return null;
  }, [
    blocked,
    assetTag,
    tagOk,
    current,
    voucherOk,
    collateralOk,
    balanceOk,
    checklistOk,
    photoKeysOk,
    cleanedPhotoKeys.length,
    noteOk,
  ]);

  function submit() {
    if (!canSubmit) return;
    onSubmit({
      type: current,
      assetTags:
        current === "checkout"
          ? cleanedAssetTags
          : assetTag.trim()
            ? [assetTag.trim().toUpperCase()]
            : [],
      ...(current === "checkout"
        ? {
            voucherToken: voucher.trim(),
            checklist: staffConfig.checklistItems.reduce<Record<string, ChecklistStatus>>(
              (acc, item) => {
                acc[item] = checklist[item] ?? "ok";
                return acc;
              },
              {},
            ),
            photoKeys: cleanedPhotoKeys,
            collateral: { type: collateralType, reference: collateralRef.trim() },
            balanceCollection: { amountIdr: Number(balanceAmount.trim()), method: balanceMethod },
          }
        : {}),
      ...(current === "incident" ? { note: note.trim() } : {}),
      ...(current === "bike_status_change" ? { note: note.trim(), toState } : {}),
    });
  }

  function updatePhotoKey(index: number, value: string) {
    setPhotoKeys((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function addPhotoKey() {
    setPhotoKeys((prev) => [...prev, ""]);
  }

  function removePhotoKey(index: number) {
    setPhotoKeys((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index)));
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
            <div>
              <Labelled label="Token voucher renter" hint="Dari QR milik renter">
                <input
                  name="voucherToken"
                  value={voucher}
                  onChange={(e) => setVoucher(e.target.value)}
                  autoFocus={focus === "voucher"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="eyJhbGci…EdDSA"
                  className="w-full border-b-2 border-line bg-transparent py-[10px] font-mono text-[14px] outline-none focus:border-rule"
                />
              </Labelled>
              {voucherPrecheck && (
                <p
                  role="status"
                  aria-live="polite"
                  className={`mt-1 font-mono text-[9px] font-medium uppercase tracking-[0.12em] ${
                    voucherPrecheck.ok ? "text-rule" : "text-signal"
                  }`}
                >
                  {voucherPrecheck.ok
                    ? "Voucher valid · pratek lokal"
                    : voucherPrecheck.code === "VOUCHER_EXPIRED"
                      ? "Voucher kedaluwarsa · akan ditolak saat sinkron"
                      : "Voucher tak valid · periksa token"}
                </p>
              )}
            </div>
          )}

          {current === "checkout" ? (
            <fieldset className="mt-4">
              <legend className="mb-2 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
                Kode sepeda · {cleanedAssetTags.length} tag
              </legend>
              {assetTags.map((tag, index) => (
                <div key={index} className="flex items-center gap-2 border-b border-line py-[6px]">
                  <input
                    name="bikeAssetTags"
                    value={tag}
                    onChange={(e) => {
                      const next = [...assetTags];
                      next[index] = e.target.value.toUpperCase();
                      setAssetTags(next);
                    }}
                    autoFocus={index === 0 && focus === "tag"}
                    autoComplete="off"
                    spellCheck={false}
                    inputMode="text"
                    placeholder="JMB-021-CMT-118"
                    className="min-h-[44px] flex-1 border-b-2 border-line bg-transparent py-[6px] font-mono text-[12px] uppercase outline-none focus:border-rule"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setAssetTags((prev) =>
                        prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index),
                      )
                    }
                    className="min-h-[44px] px-2 font-sans text-[12px] font-semibold text-rule"
                    aria-label="Hapus tag"
                  >
                    Hapus
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setAssetTags((prev) => [...prev, ""])}
                className="mt-2 min-h-[44px] w-full border-2 border-ink font-sans text-[12px] font-semibold text-ink"
              >
                Tambah sepeda
              </button>
              {tagsProblem > 0 && (
                <p
                  role="status"
                  aria-live="polite"
                  className="mt-2 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-signal"
                >
                  {tagsProblem} tag tak cocok · periksa stiker
                </p>
              )}
              {tagsProblem === 0 && tagsVerified > 0 && (
                <p className="mt-2 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
                  {tagsVerified} tag terverifikasi · pratek lokal
                </p>
              )}
            </fieldset>
          ) : (
            <Labelled label="Kode sepeda" hint="Pindai tag atau ketik kodenya">
              <input
                name="bikeAssetTag"
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
          )}

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
            <>
              <fieldset className="mt-4">
                <legend className="mb-2 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
                  Jaminan fisik
                </legend>
                <Labelled label="Tipe jaminan" hint="KTP / SIM / kendaraan">
                  <select
                    name="collateralType"
                    value={collateralType}
                    onChange={(e) => setCollateralType(e.target.value as "ktp" | "sim" | "vehicle")}
                    className="w-full border-b-2 border-line bg-transparent py-[10px] font-sans text-[14px] outline-none focus:border-rule"
                  >
                    <option value="ktp">KTP</option>
                    <option value="sim">SIM</option>
                    <option value="vehicle">Kendaraan</option>
                  </select>
                </Labelled>
                <Labelled label="Referensi (disamarkan)" hint="Nomor disamarkan, bukan lengkap">
                  <input
                    name="collateralReference"
                    value={collateralRef}
                    onChange={(e) => setCollateralRef(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="KTP ••••1234"
                    className="w-full border-b-2 border-line bg-transparent py-[10px] font-mono text-[14px] outline-none focus:border-rule"
                  />
                </Labelled>
              </fieldset>

              <fieldset className="mt-4">
                <legend className="mb-2 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
                  Saldo offline
                </legend>
                <Labelled label="Nominal (IDR)" hint="Sisa 50% yang dibayar di kasir">
                  <input
                    name="balanceAmountIdr"
                    value={balanceAmount}
                    onChange={(e) => setBalanceAmount(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="0"
                    className="w-full border-b-2 border-line bg-transparent py-[10px] font-mono text-[14px] outline-none focus:border-rule"
                  />
                </Labelled>
                <Labelled label="Metode" hint="cash atau qris">
                  <select
                    name="balanceMethod"
                    value={balanceMethod}
                    onChange={(e) => setBalanceMethod(e.target.value as "cash" | "qris")}
                    className="w-full border-b-2 border-line bg-transparent py-[10px] font-sans text-[14px] outline-none focus:border-rule"
                  >
                    <option value="cash">Tunai</option>
                    <option value="qris">QRIS</option>
                  </select>
                </Labelled>
              </fieldset>

              <fieldset className="mt-4">
                <legend className="mb-2 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
                  Pemeriksaan kondisi · 6 item
                </legend>
                {staffConfig.checklistItems.map((item) => (
                  <label
                    key={item}
                    className="flex min-h-[44px] items-center justify-between gap-3 border-b border-line font-sans text-[13px]"
                  >
                    <span>{staffConfig.checklistLabels[item as keyof typeof staffConfig.checklistLabels] ?? item}</span>
                    <select
                      value={checklist[item] ?? "ok"}
                      onChange={(e) =>
                        setChecklist((prev) => ({
                          ...prev,
                          [item]: e.target.value as ChecklistStatus,
                        }))
                      }
                      className="border-b-2 border-line bg-transparent py-[6px] font-sans text-[13px] outline-none focus:border-rule"
                    >
                      {CHECKLIST_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </fieldset>

              <fieldset className="mt-4">
                <legend className="mb-2 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
                  Foto kondisi · {staffConfig.minPhotos}–{staffConfig.maxPhotos}
                </legend>
                {photoKeys.map((key, index) => (
                  <div key={index} className="flex items-center gap-2 border-b border-line py-[6px]">
                    <input
                      name="photoKeys"
                      value={key}
                      onChange={(e) => updatePhotoKey(index, e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="uploads/checklist/••••.jpg"
                      className="min-h-[44px] flex-1 border-b-2 border-line bg-transparent py-[6px] font-mono text-[12px] outline-none focus:border-rule"
                    />
                    <button
                      type="button"
                      onClick={() => removePhotoKey(index)}
                      className="min-h-[44px] px-2 font-sans text-[12px] font-semibold text-rule"
                      aria-label="Hapus foto"
                    >
                      Hapus
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addPhotoKey}
                  disabled={photoKeys.length >= staffConfig.maxPhotos}
                  className="mt-2 min-h-[44px] w-full border-2 border-ink font-sans text-[12px] font-semibold text-ink disabled:cursor-not-allowed disabled:border-ink/30 disabled:text-ink/40"
                >
                  Tambah foto
                </button>
              </fieldset>
            </>
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
