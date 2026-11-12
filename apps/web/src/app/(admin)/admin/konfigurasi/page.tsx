"use client";

/**
 * /admin/konfigurasi — PATCH /api/v1/admin/config {key, value}.
 *
 * The key must exist in the API's config registry and the value is
 * type-checked server-side (unknown key → 404, type mismatch → 400).
 * There is no read endpoint for current values yet, so this page is a
 * patch form, not an editor: it writes exactly what the admin types and
 * reports the API's answer. Every change is audit-logged server-side.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { TopBar } from "../../_components/TopBar";
import { Actions, Btn, Note, Panel } from "../../_components/ui";
import { Field, Select, Input } from "../../_components/Field";
import { ApiError, adminSend } from "../../_lib/api";
import { CONFIG_KEYS, parseConfigValue } from "../../_lib/config-keys";

export default function AdminKonfigurasiPage() {
  const [key, setKey] = useState<string>(CONFIG_KEYS[0]?.key ?? "booking.dp_rate_bps");
  const [otherKey, setOtherKey] = useState("");
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const patch = useMutation<{ key: string; value: unknown }, ApiError, void>({
    mutationFn: () => {
      const finalKey = key === "__other" ? otherKey.trim() : key;
      return adminSend(
        "PATCH",
        "/config",
        { key: finalKey, value: parseConfigValue(value) },
        "Gagal menyimpan konfigurasi",
      );
    },
    onSuccess: (result) => {
      setSaved(
        `${result.key} = ${JSON.stringify(result.value)} — tersimpan, tercatat di audit log.`,
      );
      setValue("");
    },
  });

  const chosen = CONFIG_KEYS.find((k) => k.key === key);
  const hint = chosen?.type ?? "tipe diperiksa server";

  return (
    <>
      <TopBar title="Konfigurasi" meta="PATCH /admin/config" />
      <main className="k-admin-content">
        <p className="k-page-head">
          Nilai konfigurasi dibaca server saat runtime — tidak ada yang di-hard-code
          (SRS section 4). Angka rupiah tetap integer; tipe nilai diperiksa API.
        </p>
        <div className="k-board k-board--single">
          <Panel label="Ubah nilai konfigurasi" chip="audit">
            <form
              className="k-form"
              onSubmit={(e) => {
                e.preventDefault();
                patch.mutate();
              }}
            >
              <Field label="Kunci" hint={hint}>
                <Select value={key} onChange={(e) => setKey(e.target.value)}>
                  {CONFIG_KEYS.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.key}
                    </option>
                  ))}
                  <option value="__other">kunci lain…</option>
                </Select>
              </Field>
              {key === "__other" && (
                <Field label="Kunci lain" hint="harus terdaftar di registry API">
                  <Input
                    value={otherKey}
                    onChange={(e) => setOtherKey(e.target.value)}
                    placeholder="mis. booking.dp_rate_bps"
                  />
                </Field>
              )}
              <Field label="Nilai baru" hint="angka · true/false · teks · JSON">
                <Input
                  required
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={hint.startsWith("objek") ? '{"reminder":0,…}' : "mis. 5000"}
                />
              </Field>
              {saved && <Note>{saved}</Note>}
              {patch.isError && <Note error>{patch.error.message}</Note>}
              <Actions>
                <Btn type="submit" disabled={patch.isPending || value.trim() === ""}>
                  {patch.isPending ? "Menyimpan…" : "Simpan konfigurasi"}
                </Btn>
              </Actions>
            </form>
          </Panel>
        </div>
      </main>
    </>
  );
}
