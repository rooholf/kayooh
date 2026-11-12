"use client";

/**
 * /admin/harga — pricing rules (POST /api/v1/admin/pricing-rules).
 *
 * `rateIdr` is integer rupiah (INV-5) — the form rejects anything else
 * before it reaches the API. All seed pricing figures are FIXTURE data,
 * not decisions (PRODUCT.md "Undecided — record, never invent"): the form
 * says so on its face. Every new rule is audit-logged server-side.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { TopBar } from "../../_components/TopBar";
import { Actions, Btn, Note, Panel } from "../../_components/ui";
import { Field, Input, Select } from "../../_components/Field";
import { ApiError, adminSend } from "../../_lib/api";

const CATEGORIES = ["commuter", "road", "mtb", "fixie"] as const;

/** datetime-local → the API's V-TS shape (…Z, UTC). */
function toIsoZ(localValue: string): string | null {
  if (localValue === "") return null;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export default function AdminHargaPage() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("commuter");
  const [dayType, setDayType] = useState<"all" | "weekday" | "weekend">("all");
  const [rate, setRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [outletId, setOutletId] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const rateInt = /^\d+$/.test(rate) ? Number(rate) : null;

  const create = useMutation<{ id: string }, ApiError, void>({
    mutationFn: () => {
      const effective = toIsoZ(effectiveFrom);
      if (effective === null) throw new ApiError(0, undefined, "Waktu mulai tidak valid.");
      return adminSend(
        "POST",
        "/pricing-rules",
        {
          category,
          dayType,
          rateIdr: rateInt,
          effectiveFrom: effective,
          ...(outletId.trim() === "" ? {} : { outletId: outletId.trim() }),
        },
        "Gagal membuat aturan harga",
      );
    },
    onSuccess: () => {
      setSaved("Aturan harga tersimpan — tercatat di audit log.");
      setRate("");
    },
  });

  return (
    <>
      <TopBar title="Harga & promo" meta="POST /admin/pricing-rules" />
      <main className="k-admin-content">
        <p className="k-page-head">
          Aturan harga per kategori dan jenis hari. Promosi (kode promo) menyusul di fase
          P2 — papan tidak menampilkan daftar harga rekaan.
        </p>
        <div className="k-board k-board--single">
          <Panel label="Aturan harga baru" chip="FIXTURE">
            <Note>
              Angka harga pada data seed adalah <strong>fixture</strong>, bukan keputusan
              bisnis — mereka hidup di konfigurasi dan bisa diubah lewat aturan di bawah.
            </Note>
            <form
              className="k-form"
              style={{ marginTop: 12 }}
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <Field label="Kategori">
                <Select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Jenis hari">
                <Select
                  value={dayType}
                  onChange={(e) => setDayType(e.target.value as "all" | "weekday" | "weekend")}
                >
                  <option value="all">semua hari</option>
                  <option value="weekday">hari kerja</option>
                  <option value="weekend">akhir pekan</option>
                </Select>
              </Field>
              <Field label="Tarif (IDR)" hint="integer rupiah, tanpa titik">
                <Input
                  required
                  inputMode="numeric"
                  pattern="\d+"
                  value={rate}
                  onChange={(e) => setRate(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="mis. 20000"
                />
              </Field>
              <Field label="Berlaku mulai" hint="WIB; dikirim UTC ke server">
                <Input
                  required
                  type="datetime-local"
                  step={60}
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
              </Field>
              <Field label="Outlet (opsional)" hint="UUID outlet; kosong = semua outlet">
                <Input
                  value={outletId}
                  onChange={(e) => setOutletId(e.target.value)}
                  placeholder="UUID outlet…"
                />
              </Field>
              {saved && <Note>{saved}</Note>}
              {create.isError && <Note error>{create.error.message}</Note>}
              <Actions>
                <Btn
                  type="submit"
                  disabled={create.isPending || rateInt === null || rateInt < 1}
                >
                  {create.isPending ? "Menyimpan…" : "Simpan aturan"}
                </Btn>
              </Actions>
            </form>
          </Panel>
        </div>
      </main>
    </>
  );
}
