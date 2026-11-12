"use client";

/**
 * /admin/audit — the append-only audit log (FR-SEC-02.1, INV-6).
 *
 * GET /api/v1/admin/audit-log?entity=&limit=50&cursor= — filter by entity,
 * page by cursor. Read-only: nothing on the board edits the past.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TopBar } from "../../_components/TopBar";
import { Actions, Btn, BtnLink, Note, Panel } from "../../_components/ui";
import { Field, Input } from "../../_components/Field";
import { ApiError, adminGet } from "../../_lib/api";
import { fmtWibStamp, shortId } from "../../_lib/format";

interface AuditPage {
  items: Array<{
    id: string;
    actorId: string | null;
    actorRole: string;
    action: string;
    entity: string;
    entityId: string | null;
    before: unknown;
    after: unknown;
    createdAt: string;
  }>;
  nextCursor: string | null;
}

export default function AdminAuditPage() {
  const [entityFilter, setEntityFilter] = useState("");
  const [entity, setEntity] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  const log = useQuery<AuditPage, ApiError>({
    queryKey: ["admin", "audit", entity ?? "", cursor],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "50" });
      if (entity) params.set("entity", entity);
      if (cursor) params.set("cursor", cursor);
      return adminGet<AuditPage>(`/audit-log?${params.toString()}`, "Gagal memuat audit log");
    },
  });

  const rows = log.data?.items ?? [];
  const isSignedIn = !log.error || log.error.status !== 401;

  return (
    <>
      <TopBar title="Audit log" meta="append-only · INV-6" />
      <main className="k-admin-content">
        <p className="k-page-head">
          Setiap mutasi admin tercatat di sini — sebelum, sesudah, aktor, dan waktu WIB.
          Catatan tidak pernah diubah atau dihapus.
        </p>
        <div className="k-board k-board--single">
          <Panel label="Peristiwa" chip={log.data ? `${rows.length} baris` : undefined}>
            <form
              className="k-form"
              style={{ maxWidth: 360, marginBottom: 12 }}
              onSubmit={(e) => {
                e.preventDefault();
                setCursor(null);
                setEntity(entityFilter.trim() === "" ? null : entityFilter.trim());
              }}
            >
              <Field label="Filter entitas" hint="mis. owners, outlets, scan_events">
                <Input
                  value={entityFilter}
                  onChange={(e) => setEntityFilter(e.target.value)}
                  placeholder="kosong = semua"
                />
              </Field>
              <Actions>
                <Btn type="submit">Terapkan</Btn>
              </Actions>
            </form>

            {log.isPending && <Note>Memuat catatan…</Note>}
            {log.isError && log.error.status === 401 && (
              <Note>
                Belum masuk sebagai admin.{" "}
                <BtnLink href="/admin/masuk" variant="ghost">
                  Masuk
                </BtnLink>
              </Note>
            )}
            {log.isError && log.error.status !== 401 && <Note error>{log.error.message}.</Note>}
            {log.data && rows.length === 0 && <Note>Tidak ada peristiwa untuk filter ini.</Note>}
            {log.data && rows.length > 0 && (
              <div className="k-scroll" style={{ overflowX: "auto" }}>
                <table className="k-table">
                  <thead>
                    <tr>
                      <th>Waktu</th>
                      <th>Aksi</th>
                      <th>Entitas</th>
                      <th>Aktor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="k-mono">{fmtWibStamp(r.createdAt)}</td>
                        <td style={{ fontWeight: 700 }}>{r.action}</td>
                        <td className="k-mono">
                          {r.entity}
                          {r.entityId ? ` · ${shortId(r.entityId)}` : ""}
                        </td>
                        <td className="k-mono">
                          {r.actorRole}
                          {r.actorId ? ` · ${shortId(r.actorId)}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {log.data?.nextCursor && (
              <Actions>
                <Btn variant="ghost" onClick={() => setCursor(log.data!.nextCursor)}>
                  Muat 50 berikutnya
                </Btn>
              </Actions>
            )}
          </Panel>
        </div>
        {!isSignedIn && (
          <p className="k-page-head" style={{ marginTop: 12 }}>
            Audit log butuh sesi admin.
          </p>
        )}
      </main>
    </>
  );
}
