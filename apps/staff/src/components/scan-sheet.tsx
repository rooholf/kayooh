import { vAssetTag, vPhotoKey, vUuid } from "@repo/contracts";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatIdr, estimateLateFeeIdr } from "../lib/late-fee";
import type { ChecklistStatus, EventType } from "../db/scan-events";
import { staffConfig } from "../lib/config";
import { tagHmacPrecheck, verifyVoucherOffline, type TagHmacConfig } from "../lib/voucher";

/** FR-SEC-01.3: tag HMAC pre-check key material (build-time env, see config). */
const TAG_HMAC_CFG: TagHmacConfig = {
  keyId: staffConfig.tagHmac.keyId,
  secret: staffConfig.tagHmac.secret,
  revokedKeyIds: staffConfig.tagHmac.revokedKeyIds,
};

export type ScanMode = "checkout" | "checkin" | "inspection" | "incident" | "bike_status_change";

/** The `to` values a staff member may target (SRS section 5.1);
 * `unavailable` -> `available` stays admin-only (flagged `ROLE_NOT_ALLOWED`). */
export type StaffToState = "available" | "maintenance" | "unavailable";

export type InspectionResult = "pass" | "damage_found" | "maintenance_required";
export type IncidentType = "mechanical_failure" | "bike_missing" | "bike_damaged";

/**
 * One scan as composed by the sheet. `App` maps this to the per-type wire
 * payload (packages/contracts staff.ts — strict per type): the advisory
 * `lateMinutes` stays out of the wire payload; check-in is `bikeAssetTag`
 * only (INV-3: no renter/phone involvement).
 */
export interface ScanDraft {
  type: EventType;
  assetTags: string[];
  voucherToken?: string;
  checklist?: Record<string, ChecklistStatus>;
  photoKeys?: string[];
  collateral?: { type: "ktp" | "sim" | "vehicle"; reference: string };
  balanceCollection?: { amountIdr: number; method: "cash" | "qris" };
  rentalId?: string;
  result?: InspectionResult;
  damageDescription?: string;
  to?: StaffToState;
  reason?: string;
  incidentType?: IncidentType;
  notes?: string;
  /** Advisory late-fee preview input (check-in); never sent to the server. */
  lateMinutes?: number;
}

const MODES: Array<{ id: ScanMode; label: string }> = [
  { id: "checkout", label: "Serah terima" },
  { id: "checkin", label: "Pengembalian" },
  { id: "inspection", label: "Pemeriksaan" },
  { id: "incident", label: "Insiden" },
  { id: "bike_status_change", label: "Ubah status" },
];

const TO_STATES: Array<{ value: StaffToState; label: string }> = [
  { value: "available", label: "Siap" },
  { value: "maintenance", label: "Perawatan" },
  { value: "unavailable", label: "Tidak tersedia" },
];

const RESULT_OPTIONS: Array<{ value: InspectionResult; label: string }> = [
  { value: "pass", label: "Lolos — siap dijual" },
  { value: "damage_found", label: "Ada kerusakan" },
  { value: "maintenance_required", label: "Butuh perawatan" },
];

const INCIDENT_OPTIONS: Array<{ value: IncidentType; label: string }> = [
  { value: "mechanical_failure", label: "Gangguan mesin" },
  { value: "bike_missing", label: "Sepeda hilang" },
  { value: "bike_damaged", label: "Sepeda rusak berat" },
];

const CHECKLIST_OPTIONS: Array<{ value: ChecklistStatus; label: string }> = [
  { value: "ok", label: "OK" },
  { value: "minor_issue", label: "Masalah kecil" },
  { value: "damaged", label: "Rusak" },
];

/** V-TEXT-L bounds for the free-text fields (reason / notes / damage). */
const TEXT_MIN = 10;
const TEXT_MAX = 2000;

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
  const [toState, setToState] = useState<StaffToState>("maintenance");
  const [result, setResult] = useState<InspectionResult>("pass");
  const [incidentType, setIncidentType] = useState<IncidentType>("mechanical_failure");
  const [rentalId, setRentalId] = useState("");
  const [lateMinutesRaw, setLateMinutesRaw] = useState("");
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
      : current === "inspection"
        ? true // inspection keys off rentalId, not a bike tag
        : vAssetTag.safeParse(assetTag.trim()).success;
  const notesOk =
    current !== "incident" || (note.trim().length >= TEXT_MIN && note.trim().length <= TEXT_MAX);
  const statusReasonOk =
    current !== "bike_status_change" || (note.trim().length >= TEXT_MIN && note.trim().length <= TEXT_MAX);
  const damageDescOk =
    current !== "inspection" ||
    result !== "damage_found" ||
    (note.trim().length >= TEXT_MIN && note.trim().length <= TEXT_MAX);
  const rentalIdOk =
    current !== "inspection" || vUuid.safeParse(rentalId.trim().toLowerCase()).success;
  const voucherOk =
    current !== "checkout" ||
    (voucher.trim().length >= 4 && voucher.trim().length <= staffConfig.voucherTokenMaxLength);
  const collateralOk =
    current !== "checkout" ||
    (collateralRef.trim().length >= 1 && collateralRef.trim().length <= 200);
  const balanceOk =
    current !== "checkout" || (/^\d+$/.test(balanceAmount.trim()) && Number(balanceAmount.trim()) >= 0);
  const checklistOk =
    current !== "checkout" && current !== "inspection" ||
    staffConfig.checklistItems.every((item) => {
      const v = checklist[item];
      return v === "ok" || v === "minor_issue" || v === "damaged";
    });
  const cleanedPhotoKeys = photoKeys.map((k) => k.trim()).filter((k) => k.length > 0);
  /** Photos: checkout 1–8; inspection 0–8 (>=1 when damage_found); incident optional. */
  const minPhotos =
    current === "checkout"
      ? staffConfig.minPhotos
      : current === "inspection" && result === "damage_found"
        ? 1
        : 0;
  const photosVisible = current === "checkout" || current === "inspection" || current === "incident";
  const photoKeysOk =
    !photosVisible ||
    (cleanedPhotoKeys.length >= minPhotos &&
      cleanedPhotoKeys.length <= staffConfig.maxPhotos &&
      cleanedPhotoKeys.every((k) => vPhotoKey.safeParse(k).success));
  const lateMinutes = lateMinutesRaw.trim() === "" ? 0 : Number(lateMinutesRaw.trim());
  const lateMinutesOk =
    current !== "checkin" ||
    (lateMinutesRaw.trim() === "" ||
      (/^\d+$/.test(lateMinutesRaw.trim()) &&
        Number(lateMinutesRaw.trim()) >= 0 &&
        Number(lateMinutesRaw.trim()) < 100_000));
  const canSubmit =
    tagOk &&
    notesOk &&
    statusReasonOk &&
    damageDescOk &&
    rentalIdOk &&
    voucherOk &&
    collateralOk &&
    balanceOk &&
    checklistOk &&
    photoKeysOk &&
    lateMinutesOk &&
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
  const lateFeePreview = useMemo(
    () => (current === "checkin" ? estimateLateFeeIdr(lateMinutes) : 0),
    [current, lateMinutes],
  );

  const reason = useMemo(() => {
    if (blocked) return "Antrean penuh — pindaian baru diblokir.";
    if (
      (current === "checkout" ||
        current === "checkin" ||
        current === "incident" ||
        current === "bike_status_change") &&
      !tagOk
    )
      return "Kode sepeda harus berformat JMB-000-XXX-000.";
    if (current === "checkout" && !voucherOk) return "Isi token voucher renter.";
    if (current === "checkout" && !collateralOk) return "Isi referensi jaminan (KTP/SIM/kendaraan).";
    if (current === "checkout" && !balanceOk) return "Isi nominal saldo yang dikumpulkan.";
    if (current === "checkout" && !checklistOk) return "Lengkapi semua 6 item pemeriksaan.";
    if (current === "checkout" && !photoKeysOk) {
      if (cleanedPhotoKeys.length < staffConfig.minPhotos) return `Minimal ${staffConfig.minPhotos} foto.`;
      if (cleanedPhotoKeys.length > staffConfig.maxPhotos) return `Maksimal ${staffConfig.maxPhotos} foto.`;
      return "Kunci foto tidak valid.";
    }
    if (current === "inspection" && !rentalIdOk)
      return "Isi ID rental (UUID) dari daftar Lewat / log pengembalian.";
    if (current === "inspection" && result === "damage_found" && !damageDescOk)
      return `Jelaskan kerusakan (minimal ${TEXT_MIN} karakter).`;
    if (current === "inspection" && result === "damage_found" && !photoKeysOk)
      return "Sertakan minimal 1 foto kerusakan.";
    if (current === "incident" && !notesOk) return `Tulis catatan insiden (minimal ${TEXT_MIN} karakter).`;
    if (current === "bike_status_change" && !statusReasonOk)
      return `Tulis alasan perubahan status (minimal ${TEXT_MIN} karakter).`;
    if (current === "checkin" && !lateMinutesOk) return "Keterlambatan diisi dalam menit (0 atau lebih).";
    return null;
  }, [
    blocked,
    current,
    tagOk,
    voucherOk,
    collateralOk,
    balanceOk,
    checklistOk,
    photoKeysOk,
    cleanedPhotoKeys.length,
    rentalIdOk,
    damageDescOk,
    notesOk,
    statusReasonOk,
    result,
    lateMinutesOk,
  ]);

  function submit() {
    if (!canSubmit) return;
    onSubmit({
      type: current,
      assetTags:
        current === "checkout"
          ? cleanedAssetTags
          : current === "inspection"
            ? []
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
      ...(current === "checkin" ? { lateMinutes: lateMinutes > 0 ? lateMinutes : undefined } : {}),
      ...(current === "inspection"
        ? {
            rentalId: rentalId.trim().toLowerCase(),
            result,
            checklist: staffConfig.checklistItems.reduce<Record<string, ChecklistStatus>>(
              (acc, item) => {
                acc[item] = checklist[item] ?? "ok";
                return acc;
              },
              {},
            ),
            photoKeys: cleanedPhotoKeys,
            ...(result === "damage_found" ? { damageDescription: note.trim() } : {}),
          }
        : {}),
      ...(current === "incident"
        ? {
            incidentType,
            notes: note.trim(),
            ...(cleanedPhotoKeys.length > 0 ? { photoKeys: cleanedPhotoKeys } : {}),
          }
        : {}),
      ...(current === "bike_status_change" ? { to: toState, reason: note.trim() } : {}),
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

  const singleTagInput =
    current === "checkin" || current === "incident" || current === "bike_status_change";

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
                    ? "Voucher valid · pratinjau lokal"
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
              <p className="mt-2 font-sans text-[10px] leading-snug text-ink/70">
                Jumlah tag harus sama dengan jumlah sepeda pada reservasi (lihat tab
                Terjadwal). Tag ganda ditolak saat sinkron.
              </p>
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
                  {tagsVerified} tag terverifikasi · pratinjau lokal
                </p>
              )}
            </fieldset>
          ) : singleTagInput ? (
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
          ) : null}

          {current === "checkin" && (
            <>
              <fieldset className="mt-4">
                <legend className="mb-2 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
                  Keterlambatan · pratinjau denda
                </legend>
                <Labelled label="Menit terlambat (opsional)" hint="Dari jam balik dan jatuh tempo rental">
                  <input
                    name="lateMinutes"
                    value={lateMinutesRaw}
                    onChange={(e) => setLateMinutesRaw(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="0"
                    className="w-full border-b-2 border-line bg-transparent py-[10px] font-mono text-[14px] outline-none focus:border-rule"
                  />
                </Labelled>
                <p
                  role="status"
                  aria-live="polite"
                  className="mt-1 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule"
                >
                  {lateFeePreview > 0
                    ? `Perkiraan denda: Rp ${formatIdr(lateFeePreview)} · ditagihkan di loket`
                    : "Dalam toleransi — denda diprediksi Rp 0"}
                </p>
                <p className="mt-1 font-sans text-[10px] leading-snug text-ink/70">
                  Pratinjau saja. Denda resmi dihitung server saat sinkron dari jam
                  jatuh tempo rental.
                </p>
              </fieldset>
              <p className="mt-3 font-sans text-[10px] leading-snug text-ink/70">
                Tidak perlu identitas atau telepon renter. Reservasi multi-bike
                ditutup satu sepeda per pindaian.
              </p>
            </>
          )}

          {current === "inspection" && (
            <>
              <Labelled label="ID rental" hint="Dari tab Lewat atau log pengembalian">
                <input
                  name="rentalId"
                  value={rentalId}
                  onChange={(e) => setRentalId(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="9f2c4b7e-…"
                  className="w-full border-b-2 border-line bg-transparent py-[10px] font-mono text-[14px] outline-none focus:border-rule"
                />
              </Labelled>
              <Labelled
                label="Hasil pemeriksaan"
                hint="Lolos = siap dijual; kerusakan / perawatan = sepeda masuk perawatan"
              >
                <select
                  value={result}
                  onChange={(e) => setResult(e.target.value as InspectionResult)}
                  className="w-full border-b-2 border-line bg-transparent py-[10px] font-sans text-[14px] outline-none focus:border-rule"
                >
                  {RESULT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Labelled>
              {result === "damage_found" && (
                <Labelled
                  label="Deskripsi kerusakan"
                  hint="Wajib saat ada kerusakan — penyelesaian offline terhadap jaminan yang dicatat"
                >
                  <textarea
                    name="damageDescription"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Rangka penyok di bagian depan, rem depan kendor"
                    className="w-full resize-none border-b-2 border-line bg-transparent py-[8px] font-sans text-[14px] outline-none focus:border-rule"
                  />
                </Labelled>
              )}
            </>
          )}

          {current === "incident" && (
            <Labelled
              label="Jenis insiden"
              hint="Gangguan mesin butuh rental berjalan (DP dipulihkan); hilang / rusak berat memicu alokasi ulang"
            >
              <select
                value={incidentType}
                onChange={(e) => setIncidentType(e.target.value as IncidentType)}
                className="w-full border-b-2 border-line bg-transparent py-[10px] font-sans text-[14px] outline-none focus:border-rule"
              >
                {INCIDENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Labelled>
          )}

          {current === "bike_status_change" && (
            <Labelled
              label="Status baru"
              hint="Staf tidak bisa membuka kembali status 'tidak tersedia' — hanya admin"
            >
              <select
                value={toState}
                onChange={(e) => setToState(e.target.value as StaffToState)}
                className="w-full border-b-2 border-line bg-transparent py-[10px] font-sans text-[14px] outline-none focus:border-rule"
              >
                {TO_STATES.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </select>
            </Labelled>
          )}

          {current === "incident" && (
            <Labelled label="Catatan" hint={`Sesingkat mungkin, minimal ${TEXT_MIN} karakter`}>
              <textarea
                name="incidentNotes"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Rantai putus di tengah jalan, sepeda masih di dalam"
                className="w-full resize-none border-b-2 border-line bg-transparent py-[8px] font-sans text-[14px] outline-none focus:border-rule"
              />
            </Labelled>
          )}

          {current === "bike_status_change" && (
            <Labelled
              label="Alasan perubahan"
              hint={`Sesingkat mungkin, minimal ${TEXT_MIN} karakter`}
            >
              <textarea
                name="statusReason"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Rantai diganti, rem dikencangkan ulang"
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
                <p className="mt-2 font-sans text-[10px] leading-snug text-ink/70">
                  Jaminan wajib dicatat — tanpa jaminan, serah terima ditolak saat
                  sinkron (COLLATERAL_REQUIRED).
                </p>
              </fieldset>

              <fieldset className="mt-4">
                <legend className="mb-2 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
                  Saldo offline
                </legend>
                <Labelled
                  label="Nominal (IDR)"
                  hint="Sama dengan total akhir kurang uang muka — beda nominal ditolak (BALANCE_MISMATCH)"
                >
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
            </>
          )}

          {(current === "checkout" || current === "inspection") && (
            <fieldset className="mt-4">
              <legend className="mb-2 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
                Pemeriksaan kondisi · 6 item
              </legend>
              {staffConfig.checklistItems.map((item) => (
                <label
                  key={item}
                  className="flex min-h-[44px] items-center justify-between gap-3 border-b border-line font-sans text-[13px]"
                >
                  <span>
                    {staffConfig.checklistLabels[item as keyof typeof staffConfig.checklistLabels] ??
                      item}
                  </span>
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
          )}

          {photosVisible && (
            <fieldset className="mt-4">
              <legend className="mb-2 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-rule">
                {current === "checkout"
                  ? `Foto kondisi · ${staffConfig.minPhotos}–${staffConfig.maxPhotos}`
                  : current === "inspection" && result === "damage_found"
                    ? `Foto kerusakan · minimal ${minPhotos}, maksimal ${staffConfig.maxPhotos}`
                    : current === "inspection"
                      ? `Foto kondisi · 0–${staffConfig.maxPhotos}`
                      : `Foto · opsional, maksimal ${staffConfig.maxPhotos}`}
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
