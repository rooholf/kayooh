"use client";

/**
 * /admin/sepeda — onboard bikes (POST /api/v1/admin/bikes and /bikes/bulk).
 *
 * Asset tags follow the platform convention
 * `JMB-<outlet 3 digits>-<COM|ROD|MTB|FIX>-<nnn>` (V-ASSET-TAG). The bulk
 * path is all-or-nothing (max 200, FR-CAT-02.3); the tag counter starts at
 * a typed start number so re-runs never collide. homeOutletId comes from
 * the live outlet catalog (public read — real UUIDs, no pasting).
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { TopBar } from "../../_components/TopBar";
import { Actions, Btn, Note, Panel } from "../../_components/ui";
import { Field, Input, Select } from "../../_components/Field";
import { ApiError, adminGet, adminSend, fetchOutlets, type OutletListItem } from "../../_lib/api";
import { catTag, fmtInt } from "../../_lib/format";

const CATEGORIES = ["commuter", "road", "mtb", "fixie"] as const;

export default function AdminSepedaPage() {
  const outlets = useQuery<OutletListItem[], ApiError>({
    queryKey: ["admin", "outlets"],
    queryFn: fetchOutlets,
    staleTime: 60_000,
  });

  interface BikeRow {
    id: string;
    assetTag: string;
    category: string;
    homeOutletId: string;
    currentOutletId: string;
    state: string;
    ownerId: string;
  }

  const bikes = useQuery<{ items: BikeRow[] }, ApiError>({
    queryKey: ["admin", "bikes"],
    queryFn: () => adminGet<{ items: BikeRow[] }>("/bikes", "Gagal memuat daftar sepeda"),
    refetchInterval: 30_000,
  });

  const BIKE_STATES = ["available", "maintenance", "unavailable"] as const;
  const [overrideBike, setOverrideBike] = useState("");
  const [overrideTo, setOverrideTo] = useState<(typeof BIKE_STATES)[number]>("maintenance");
  const [overrideReason, setOverrideReason] = useState("");

  const override = useMutation<{ id: string; state: string }, ApiError, void>({
    mutationFn: () =>
      adminSend(
        "PATCH",
        `/bikes/${overrideBike}/state`,
        { to: overrideTo, reason: overrideReason.trim() },
        "Gagal mengubah state sepeda",
      ),
    onSuccess: () => {
      setOverrideReason("");
      bikes.refetch();
    },
  });

  // ---- single ------------------------------------------------------------
  const [tag, setTag] = useState("");
  const [singleCategory, setSingleCategory] = useState<(typeof CATEGORIES)[number]>("commuter");
  const [singleOutlet, setSingleOutlet] = useState("");
  const [singleDone, setSingleDone] = useState<string | null>(null);

  const createOne = useMutation<{ id: string }, ApiError, void>({
    mutationFn: () =>
      adminSend(
        "POST",
        "/bikes",
        { assetTag: tag.trim(), category: singleCategory, homeOutletId: singleOutlet },
        "Gagal mendaftarkan sepeda",
      ),
    onSuccess: (r) => {
      setSingleDone(r.id);
      setTag("");
    },
  });

  // ---- bulk --------------------------------------------------------------
  const [bulkOutlet, setBulkOutlet] = useState("");
  const [bulkCategory, setBulkCategory] = useState<(typeof CATEGORIES)[number]>("commuter");
  const [count, setCount] = useState("10");
  const [startNo, setStartNo] = useState("1");
  const [bulkDone, setBulkDone] = useState<number | null>(null);

  const countInt = /^\d+$/.test(count) ? Number(count) : null;
  const startInt = /^\d+$/.test(startNo) ? Number(startNo) : null;

  const buildTags = (outletCode: string): string[] => {
    const digits = outletCode.replace("JMB-", "");
    const cat = catTag(bulkCategory);
    const n = countInt ?? 0;
    return Array.from(
      { length: n },
      (_, i) => `JMB-${digits}-${cat}-${String((startInt ?? 1) + i).padStart(3, "0")}`,
    );
  };

  const createBulk = useMutation<
    { created: number; ids: string[] },
    ApiError,
    void
  >({
    mutationFn: () => {
      const outlet = outlets.data?.find((o) => o.id === bulkOutlet);
      const items = buildTags(outlet?.code ?? "").map((assetTag) => ({
        assetTag,
        category: bulkCategory,
        homeOutletId: bulkOutlet,
      }));
      return adminSend("POST", "/bikes/bulk", { items }, "Gagal mendaftarkan sepeda (bulk)");
    },
    onSuccess: (r) => setBulkDone(r.created ?? null),
  });

  return (
    <>
      <TopBar title="Onboard sepeda" meta="POST /admin/bikes · /bikes/bulk" />
      <main className="k-admin-content">
        <p className="k-page-head">
          Sepeda baru selalu berstatus <span className="k-chip quiet">available</span> di
          home outlet-nya. Sepeda tidak pernah berstatus held/reserved — tekanan reserva
          dihitung dari reservasi, bukan state sepeda (A-05).
        </p>
        <div className="k-board k-board--single">
          <Panel label="Satu sepeda" chip="audit">
            <form
              className="k-form"
              onSubmit={(e) => {
                e.preventDefault();
                createOne.mutate();
              }}
            >
              <Field label="Aset tag" hint="JMB-XXX-COM/ROD/MTB/FIX-NNN">
                <Input
                  required
                  pattern="JMB-\d{3}-(COM|ROD|MTB|FIX)-\d{3}"
                  value={tag}
                  onChange={(e) => setTag(e.target.value.toUpperCase())}
                  placeholder="JMB-001-COM-021"
                />
              </Field>
              <Field label="Kategori">
                <Select
                  value={singleCategory}
                  onChange={(e) =>
                    setSingleCategory(e.target.value as (typeof CATEGORIES)[number])
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Home outlet">
                <Select
                  required
                  value={singleOutlet}
                  onChange={(e) => setSingleOutlet(e.target.value)}
                >
                  <option value="" disabled>
                    pilih outlet…
                  </option>
                  {(outlets.data ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} · {o.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {singleDone && (
                <Note>
                  Sepeda terdaftar ({shortTag(tag)}) — tercatat di audit log.
                </Note>
              )}
              {createOne.isError && <Note error>{createOne.error.message}</Note>}
              <Actions>
                <Btn type="submit" disabled={createOne.isPending || singleOutlet === ""}>
                  {createOne.isPending ? "Menyimpan…" : "Daftarkan sepeda"}
                </Btn>
              </Actions>
            </form>
          </Panel>

          <Panel label="Sekaligus (bulk)" chip="maks 200 · all-or-nothing">
            <form
              className="k-form"
              onSubmit={(e) => {
                e.preventDefault();
                createBulk.mutate();
              }}
            >
              <Field label="Home outlet">
                <Select
                  required
                  value={bulkOutlet}
                  onChange={(e) => setBulkOutlet(e.target.value)}
                >
                  <option value="" disabled>
                    pilih outlet…
                  </option>
                  {(outlets.data ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} · {o.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Kategori">
                <Select
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value as (typeof CATEGORIES)[number])}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Jumlah" hint="1–200 unit">
                <Input
                  required
                  inputMode="numeric"
                  pattern="\d+"
                  value={count}
                  onChange={(e) => setCount(e.target.value.replace(/[^\d]/g, ""))}
                />
              </Field>
              <Field label="Nomor awal tag" hint="agar re-run tidak bertabrakan">
                <Input
                  required
                  inputMode="numeric"
                  pattern="\d+"
                  value={startNo}
                  onChange={(e) => setStartNo(e.target.value.replace(/[^\d]/g, ""))}
                />
              </Field>
              {bulkOutlet !== "" && countInt !== null && countInt > 0 && (
                <p className="k-page-head" style={{ margin: 0, fontFamily: "var(--mono)", fontSize: 11 }}>
                  contoh: {buildTags(outlets.data?.find((o) => o.id === bulkOutlet)?.code ?? "").slice(0, 2).join(" · ")}
                  {countInt > 2 ? ` … (${fmtInt(countInt)} tag)` : ""}
                </p>
              )}
              {bulkDone !== null && (
                <Note>{fmtInt(bulkDone)} sepeda terdaftar — tercatat di audit log.</Note>
              )}
              {createBulk.isError && <Note error>{createBulk.error.message}</Note>}
              <Actions>
                <Btn
                  type="submit"
                  disabled={
                    createBulk.isPending ||
                    bulkOutlet === "" ||
                    countInt === null ||
                    countInt < 1 ||
                    countInt > 200 ||
                    startInt === null
                  }
                >
                  {createBulk.isPending ? "Menyimpan…" : "Daftarkan sekaligus"}
                </Btn>
              </Actions>
            </form>
          </Panel>

          <Panel label="Ubah state sepeda" chip="PATCH /admin/bikes/{id}/state">
            <form
              className="k-form"
              onSubmit={(e) => {
                e.preventDefault();
                override.mutate();
              }}
            >
              <Field label="Sepeda" hint="pilih dari daftar">
                <Select
                  required
                  value={overrideBike}
                  onChange={(e) => setOverrideBike(e.target.value)}
                >
                  <option value="" disabled>
                    pilih sepeda…
                  </option>
                  {(bikes.data?.items ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.assetTag} · {b.state}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="State baru">
                <Select
                  value={overrideTo}
                  onChange={(e) => setOverrideTo(e.target.value as (typeof BIKE_STATES)[number])}
                >
                  {BIKE_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Alasan" hint="V-TEXT-L">
                <Input
                  required
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="mis. servis rem depan"
                />
              </Field>
              {override.isError && <Note error>{override.error.message}</Note>}
              {override.isSuccess && <Note>State sepeda diperbarui — tercatat di audit log.</Note>}
              <Actions>
                <Btn
                  type="submit"
                  disabled={override.isPending || overrideBike === "" || overrideReason.trim().length === 0}
                >
                  {override.isPending ? "Menyimpan…" : "Ubah state"}
                </Btn>
              </Actions>
            </form>
          </Panel>

          <Panel label="Daftar sepeda" chip={bikes.data ? `${bikes.data.items.length} sepeda` : undefined}>
            {bikes.isPending && <p className="k-page-head">Memuat…</p>}
            {bikes.isError && <Note error>{bikes.error.message}</Note>}
            {bikes.data && bikes.data.items.length === 0 && (
              <Note>Belum ada sepeda terdaftar.</Note>
            )}
            {bikes.data && bikes.data.items.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {bikes.data.items.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "6px 0",
                      borderBottom: "1px dashed var(--tinta)",
                      fontFamily: "var(--mono)",
                      fontSize: 12,
                    }}
                  >
                    <span>{b.assetTag}</span>
                    <span className={`k-chip ${b.state === "available" ? "quiet" : ""}`}>
                      {b.state}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </main>
    </>
  );
}

function shortTag(tag: string): string {
  return tag.trim();
}
