"use client";

/**
 * /admin/masuk — admin credential sign-in (Better Auth `sign-in/email`
 * through the auth pipe; the HttpOnly session cookie lands on the web
 * origin, NFR-04). Admin accounts are provisioned only via
 * POST /admin/users (FR-ID-02.1) — there is no self-signup on this door.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "../../_components/TopBar";
import { Actions, Btn, BtnLink, Note, Panel } from "../../_components/ui";
import { Field, Input } from "../../_components/Field";
import { ApiError, adminGet, signInAdmin, signOutAdmin } from "../../_lib/api";

export default function AdminMasukPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // A signed-in admin gets the door back out immediately.
  const session = useQuery({
    queryKey: ["admin", "session"],
    queryFn: () => adminGet<{ items: unknown[] }>("/audit-log?limit=1", "cek sesi"),
    retry: 0,
    refetchOnWindowFocus: false,
  });
  const signedIn = session.isSuccess;

  const clearSession = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
  };

  const signIn = useMutation<void, ApiError, void>({
    mutationFn: () => signInAdmin(email.trim(), password),
    onSuccess: () => {
      clearSession();
      router.push("/admin");
    },
  });

  const signOut = useMutation<void, ApiError, void>({
    mutationFn: () => signOutAdmin(),
    onSuccess: () => {
      clearSession();
      session.refetch();
    },
  });

  return (
    <>
      <TopBar title="Masuk admin" />
      <main className="k-admin-content">
        <div className="k-board k-board--single">
          <Panel label="Sesi admin" chip="TTL 8 jam">
            {signedIn ? (
              <>
                <p className="k-page-head">Sesi admin sudah aktif.</p>
                <Actions>
                  <BtnLink href="/admin">Ke dashboard</BtnLink>
                  <Btn variant="ghost" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
                    Keluar
                  </Btn>
                </Actions>
              </>
            ) : (
              <>
                <p className="k-page-head">
                  Akun admin dibuat lewat <span className="k-chip quiet">POST /admin/users</span> —
                  tidak ada pendaftaran mandiri. Sesi berlaku 8 jam.
                </p>
                <form
                  className="k-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    signIn.mutate();
                  }}
                >
                  <Field label="Email">
                    <Input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@kayooh.dev"
                    />
                  </Field>
                  <Field label="Kata sandi">
                    <Input
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>
                  {signIn.isError && <Note error>{signIn.error.message}</Note>}
                  <Actions>
                    <Btn
                      type="submit"
                      disabled={signIn.isPending}
                      onClick={(e) => {
                        // The button sits in a form; submit is its job.
                        e.preventDefault();
                        signIn.mutate();
                      }}
                    >
                      {signIn.isPending ? "Memeriksa…" : "Masuk"}
                    </Btn>
                    <BtnLink href="/" variant="ghost">
                      Ke halaman penyewa
                    </BtnLink>
                  </Actions>
                </form>
              </>
            )}
          </Panel>
        </div>
      </main>
    </>
  );
}
