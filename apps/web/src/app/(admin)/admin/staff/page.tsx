"use client";

/**
 * /admin/staff — provision user accounts (POST /api/v1/admin/users,
 * FR-ID-02.1). Public sign-up is disabled for these roles: only an admin
 * creates staff/owner/admin accounts, and the password is set here (min
 * 12 chars). Staff need their outlet; owner accounts need their owner id.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { TopBar } from "../../_components/TopBar";
import { Actions, Btn, Note, Panel } from "../../_components/ui";
import { Field, Input, Select } from "../../_components/Field";
import { ApiError, adminSend, fetchOutlets, type OutletListItem } from "../../_lib/api";

type Role = "staff" | "owner" | "admin";

export default function AdminStaffPage() {
  const outlets = useQuery<OutletListItem[], ApiError>({
    queryKey: ["admin", "outlets"],
    queryFn: fetchOutlets,
    staleTime: 60_000,
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [outletId, setOutletId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const create = useMutation<{ id?: string }, ApiError, void>({
    mutationFn: () =>
      adminSend(
        "POST",
        "/users",
        {
          email: email.trim(),
          password,
          role,
          ...(role === "staff" && outletId !== "" ? { outletId } : {}),
          ...(role === "owner" && ownerId !== "" ? { ownerId: ownerId.trim() } : {}),
        },
        "Gagal membuat akun",
      ),
    onSuccess: () => {
      setDone(email.trim());
      setEmail("");
      setPassword("");
    },
  });

  return (
    <>
      <TopBar title="Akun staff & owner" meta="POST /admin/users" />
      <main className="k-admin-content">
        <p className="k-page-head">
          Pendaftaran mandiri tidak ada untuk role ini — akun hanya lahir lewat form ini,
          dan setiap akun tercatat di audit log. Kata sandi minimal 12 karakter.
        </p>
        <div className="k-board k-board--single">
          <Panel label="Akun baru" chip="audit">
            <form
              className="k-form"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <Field label="Role">
                <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="staff">staff (operator outlet)</option>
                  <option value="owner">owner (pemilik armada)</option>
                  <option value="admin">admin</option>
                </Select>
              </Field>
              <Field label="Email">
                <Input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@kayooh.dev"
                />
              </Field>
              <Field label="Kata sandi" hint="min. 12 karakter">
                <Input
                  required
                  type="password"
                  minLength={12}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {role === "staff" && (
                <Field label="Outlet" hint="wajib untuk staff">
                  <Select required value={outletId} onChange={(e) => setOutletId(e.target.value)}>
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
              )}
              {role === "owner" && (
                <Field label="Owner ID" hint="UUID — dari form onboard owner">
                  <Input
                    required
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                    placeholder="UUID owner…"
                  />
                </Field>
              )}
              {done && <Note>Akun {done} dibuat — tercatat di audit log.</Note>}
              {create.isError && <Note error>{create.error.message}</Note>}
              <Actions>
                <Btn
                  type="submit"
                  disabled={create.isPending || password.length < 12}
                >
                  {create.isPending ? "Menyimpan…" : "Buat akun"}
                </Btn>
              </Actions>
            </form>
          </Panel>
        </div>
      </main>
    </>
  );
}
