"use client";

/**
 * /admin/outlet — onboard an outlet (POST /api/v1/admin/outlets).
 *
 * Hours are V-HOURS (mon..sun, 0–2 intervals per day, minutes :00/:30);
 * this form builds one interval per day plus "tutup". Coordinates are
 * outlet-only (NEG-1/2: bikes carry no GPS) and land in the API as
 * numbers. Categories must already exist in the catalog.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { TopBar } from "../../_components/TopBar";
import { Actions, Btn, Note, Panel } from "../../_components/ui";
import { Field, Input, Select } from "../../_components/Field";
import { ApiError, adminGet, adminSend } from "../../_lib/api";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<(typeof DAYS)[number], string> = {
  mon: "Senin",
  tue: "Selasa",
  wed: "Rabu",
  thu: "Kamis",
  fri: "Jumat",
  sat: "Sabtu",
  sun: "Minggu",
};
const CATEGORIES = ["commuter", "road", "mtb", "fixie"] as const;

/** Half-hour steps from 06:00 to 22:00 — the legal V-HOURS minutes only. */
const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 22; h++) {
  for (const m of ["00", "30"]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${m}`);
  }
}

type DayPlan = { open: string; close: string } | null;

export default function AdminOutletPage() {
  const [ownerId, setOwnerId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [categories, setCategories] = useState<string[]>(["commuter"]);
  const [days, setDays] = useState<Record<(typeof DAYS)[number], DayPlan>>({
    mon: { open: "08:00", close: "17:00" },
    tue: { open: "08:00", close: "17:00" },
    wed: { open: "08:00", close: "17:00" },
    thu: { open: "08:00", close: "17:00" },
    fri: { open: "08:00", close: "17:00" },
    sat: { open: "08:00", close: "17:00" },
    sun: null,
  });
  const [createdId, setCreatedId] = useState<string | null>(null);

  interface OutletRow {
    id: string;
    ownerId: string;
    code: string;
    name: string;
    status: string;
    address: string;
    createdAt: string;
  }

  const outlets = useQuery<{ items: OutletRow[] }, ApiError>({
    queryKey: ["admin", "outlets-list"],
    queryFn: () => adminGet<{ items: OutletRow[] }>("/outlets", "Gagal memuat daftar outlet"),
    refetchInterval: 30_000,
  });

  const patchStatus = useMutation<{ id: string }, ApiError, { id: string; status: "active" | "inactive" }>({
    mutationFn: ({ id, status }) =>
      adminSend("PATCH", `/outlets/${id}`, { status }, "Gagal mengubah status outlet"),
    onSuccess: () => outlets.refetch(),
  });

  const hours = Object.fromEntries(
    DAYS.map((d) => [d, days[d] ? [days[d]!] : []]),
  );

  const create = useMutation<{ id: string }, ApiError, void>({
    mutationFn: () =>
      adminSend(
        "POST",
        "/outlets",
        {
          ownerId: ownerId.trim(),
          code: code.trim(),
          name: name.trim(),
          address: address.trim(),
          lat: Number(lat),
          lng: Number(lng),
          hours,
          categories,
        },
        "Gagal mendaftarkan outlet",
      ),
    onSuccess: (r) => setCreatedId(r.id),
  });

  const setDay = (d: (typeof DAYS)[number], plan: DayPlan) =>
    setDays((prev) => ({ ...prev, [d]: plan }));

  const toggleCategory = (c: string) =>
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );

  return (
    <>
      <TopBar title="Onboard outlet" meta="POST /admin/outlets" />
      <main className="k-admin-content">
        <p className="k-page-head">
          Outlet adalah satu-satunya tempat sepeda berada — setiap perubahan status
          sepeda terikat ke outlet (Prinsip 2). Koordinat hanya milik outlet, bukan sepeda.
        </p>
        <div className="k-board k-board--single">
          <Panel label="Outlet baru" chip="audit">
            <form
              className="k-form"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <Field label="Owner ID" hint="UUID — dari form onboard owner">
                <Input
                  required
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  placeholder="UUID owner…"
                />
              </Field>
              <Field label="Kode outlet" hint="format JMB-XXX (3 digit)">
                <Input
                  required
                  pattern="JMB-\d{3}"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="JMB-006"
                />
              </Field>
              <Field label="Nama outlet">
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="mis. Jambi City Center"
                />
              </Field>
              <Field label="Alamat">
                <Input
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Jl. …"
                />
              </Field>
              <Field label="Koordinat" hint="lintang & bujur derajat desimal">
                <div style={{ display: "flex", gap: 8 }}>
                  <Input
                    required
                    type="number"
                    step="any"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="lat, mis. -1.61"
                  />
                  <Input
                    required
                    type="number"
                    step="any"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    placeholder="lng, mis. 103.61"
                  />
                </div>
              </Field>
              <Field label="Kategori yang disewakan" hint="pilih minimal satu">
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {CATEGORIES.map((c) => (
                    <label key={c} className="k-check">
                      <input
                        type="checkbox"
                        checked={categories.includes(c)}
                        onChange={() => toggleCategory(c)}
                      />
                      {c}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Jam buka" hint="interval :00 / :30; kosong = tutup">
                <div style={{ display: "grid", gap: 6 }}>
                  {DAYS.map((d) => (
                    <div key={d} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ width: 64, fontSize: 12, fontWeight: 600 }}>
                        {DAY_LABELS[d]}
                      </span>
                      {days[d] === null ? (
                        <span style={{ fontSize: 11, opacity: 0.6 }}>tutup</span>
                      ) : (
                        <>
                          <Select
                            aria-label={`Buka ${DAY_LABELS[d]}`}
                            value={days[d]!.open}
                            onChange={(e) => setDay(d, { open: e.target.value, close: days[d]!.close })}
                            style={{ width: 96 }}
                          >
                            {TIME_OPTIONS.map((t) => (
                              <option key={t}>{t}</option>
                            ))}
                          </Select>
                          <span style={{ fontSize: 11 }}>–</span>
                          <Select
                            aria-label={`Tutup ${DAY_LABELS[d]}`}
                            value={days[d]!.close}
                            onChange={(e) => setDay(d, { open: days[d]!.open, close: e.target.value })}
                            style={{ width: 96 }}
                          >
                            {TIME_OPTIONS.map((t) => (
                              <option key={t}>{t}</option>
                            ))}
                          </Select>
                        </>
                      )}
                      <button
                        type="button"
                        className="k-btn ghost"
                        style={{ padding: "3px 8px", fontSize: 10 }}
                        onClick={() => setDay(d, days[d] === null ? { open: "08:00", close: "17:00" } : null)}
                      >
                        {days[d] === null ? "buka" : "tutup"}
                      </button>
                    </div>
                  ))}
                </div>
              </Field>
              {createdId && (
                <Note>
                  Outlet terdaftar:{" "}
                  <span className="k-chip quiet" style={{ fontFamily: "var(--mono)" }}>
                    {createdId}
                  </span>{" "}
                  — ID ini jadi <span className="k-chip quiet">homeOutletId</span> saat
                  onboard sepeda.
                </Note>
              )}
              {create.isError && <Note error>{create.error.message}</Note>}
              <Actions>
                <Btn
                  type="submit"
                  disabled={create.isPending || categories.length === 0}
                >
                  {create.isPending ? "Menyimpan…" : "Daftarkan outlet"}
                </Btn>
              </Actions>
            </form>
          </Panel>

          <Panel label="Daftar outlet" chip={outlets.data ? `${outlets.data.items.length} outlet` : undefined}>
            {outlets.isPending && <p className="k-page-head">Memuat…</p>}
            {outlets.isError && <Note error>{outlets.error.message}</Note>}
            {outlets.data && outlets.data.items.length === 0 && (
              <Note>Belum ada outlet terdaftar.</Note>
            )}
            {outlets.data && outlets.data.items.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {outlets.data.items.map((o) => (
                  <div
                    key={o.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "8px 0",
                      borderBottom: "1px dashed var(--tinta)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>
                        {o.code} · {o.name}
                      </div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 11, opacity: 0.7 }}>
                        {o.id} · {o.address}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span className={`k-chip ${o.status === "active" ? "quiet" : ""}`}>
                        {o.status}
                      </span>
                      <Btn
                        variant="ghost"
                        disabled={patchStatus.isPending}
                        onClick={() =>
                          patchStatus.mutate({
                            id: o.id,
                            status: o.status === "active" ? "inactive" : "active",
                          })
                        }
                      >
                        {o.status === "active" ? "Nonaktifkan" : "Aktifkan"}
                      </Btn>
                    </div>
                  </div>
                ))}
                {patchStatus.isError && <Note error>{patchStatus.error.message}</Note>}
              </div>
            )}
          </Panel>
        </div>
      </main>
    </>
  );
}
