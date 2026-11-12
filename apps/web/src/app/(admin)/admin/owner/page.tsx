"use client";

/**
 * /admin/owner — onboard an owner (POST /api/v1/admin/owners, FR-CAT-02).
 * Bank details are settlement data: name + code + account number, kept as
 * typed strings (the account number is digits, never a float). The API
 * returns the new owner id — surfaced for copy, because the outlet form
 * needs it as `ownerId`.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { TopBar } from "../../_components/TopBar";
import { Actions, Btn, Note, Panel } from "../../_components/ui";
import { Field, Input } from "../../_components/Field";
import { ApiError, adminGet, adminSend } from "../../_lib/api";

export default function AdminOwnerPage() {
  const [name, setName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);

  interface OwnerRow {
    id: string;
    name: string;
    status: string;
    bankCode: string | null;
    bankAccountNumber: string | null;
    bankAccountName: string | null;
    createdAt: string;
  }

  const owners = useQuery<{ items: OwnerRow[] }, ApiError>({
    queryKey: ["admin", "owners"],
    queryFn: () => adminGet<{ items: OwnerRow[] }>("/owners", "Gagal memuat daftar owner"),
    refetchInterval: 30_000,
  });

  const patchStatus = useMutation<{ id: string; status: string }, ApiError, { id: string; status: "active" | "suspended" }>({
    mutationFn: ({ id, status }) =>
      adminSend("PATCH", `/owners/${id}`, { status }, "Gagal mengubah status owner"),
    onSuccess: () => owners.refetch(),
  });

  const create = useMutation<{ id: string }, ApiError, void>({
    mutationFn: () =>
      adminSend(
        "POST",
        "/owners",
        {
          name: name.trim(),
          bankCode: bankCode.trim(),
          bankAccountNumber: accountNumber.trim(),
          bankAccountName: accountName.trim(),
        },
        "Gagal mendaftarkan owner",
      ),
    onSuccess: (r) => setCreatedId(r.id),
  });

  return (
    <>
      <TopBar title="Onboard owner" meta="POST /admin/owners" />
      <main className="k-admin-content">
        <p className="k-page-head">
          Owner adalah individu pemilik armada — satu owner, satu outlet hari ini.
          Rekening dipakai modul settlement (P2) untuk payout.
        </p>
        <div className="k-board k-board--single">
          <Panel label="Owner baru" chip="audit">
            <form
              className="k-form"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <Field label="Nama owner">
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="mis. CV Jambi Sepeda Maju"
                />
              </Field>
              <Field label="Kode bank" hint="mis. BRI, BCA, Mandiri">
                <Input
                  required
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  placeholder="BRI"
                />
              </Field>
              <Field label="Nomor rekening" hint="6–20 digit">
                <Input
                  required
                  inputMode="numeric"
                  pattern="\d{6,20}"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="1234567890"
                />
              </Field>
              <Field label="Nama pemilik rekening">
                <Input
                  required
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="sesi rekening bank"
                />
              </Field>
              {createdId && (
                <Note>
                  Owner terdaftar:{" "}
                  <span className="k-chip quiet" style={{ fontFamily: "var(--mono)" }}>
                    {createdId}
                  </span>{" "}
                  — salin ID ini untuk form onboard outlet.
                </Note>
              )}
              {create.isError && <Note error>{create.error.message}</Note>}
              <Actions>
                <Btn type="submit" disabled={create.isPending}>
                  {create.isPending ? "Menyimpan…" : "Daftarkan owner"}
                </Btn>
              </Actions>
            </form>
          </Panel>

          <Panel label="Daftar owner" chip={owners.data ? `${owners.data.items.length} owner` : undefined}>
            {owners.isPending && <p className="k-page-head">Memuat…</p>}
            {owners.isError && <Note error>{owners.error.message}</Note>}
            {owners.data && owners.data.items.length === 0 && (
              <Note>Belum ada owner terdaftar.</Note>
            )}
            {owners.data && owners.data.items.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {owners.data.items.map((o) => (
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
                      <div style={{ fontWeight: 700 }}>{o.name}</div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 11, opacity: 0.7 }}>
                        {o.id} · {o.bankCode} {o.bankAccountNumber}
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
                            status: o.status === "active" ? "suspended" : "active",
                          })
                        }
                      >
                        {o.status === "active" ? "Suspensi" : "Aktifkan"}
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
