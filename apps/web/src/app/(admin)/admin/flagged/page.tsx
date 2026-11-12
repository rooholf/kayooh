"use client";

/**
 * /admin/flagged — the unresolved flagged-scan queue (FR-SEC-02.2).
 *
 * GET  /api/v1/admin/flagged-scans?limit=50  (unresolved only)
 * PATCH /api/v1/admin/flagged-scans/{id}     { resolution, note }
 *
 * Every resolution is audit-logged server-side; a resolved row leaves the
 * queue (includeResolved=false is the API default). Paging via cursor.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "../../_components/TopBar";
import { Actions, Btn, BtnLink, Note, Panel, PaintedTotal } from "../../_components/ui";
import { Field, Select, Textarea } from "../../_components/Field";
import { ApiError, adminGet, adminSend } from "../../_lib/api";
import { fmtWibStamp, scanTypeLabel, shortId } from "../../_lib/format";

interface FlaggedPage {
  items: Array<{
    id: string;
    clientEventId: string;
    type: string;
    outletId: string | null;
    staffId: string | null;
    occurredAt: string;
    receivedAt: string;
    flagReason: string | null;
  }>;
  nextCursor: string | null;
}

export default function AdminFlaggedPage() {
  const queryClient = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null);
  const [resolution, setResolution] = useState<"dismissed" | "corrected">("corrected");
  const [note, setNote] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const queue = useQuery<FlaggedPage, ApiError>({
    queryKey: ["admin", "flagged", "page", cursor],
    queryFn: () =>
      adminGet<FlaggedPage>(
        `/flagged-scans?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        "Gagal memuat antrian",
      ),
    refetchInterval: 60_000,
  });

  const resolve = useMutation<
    { id: string },
    ApiError,
    { id: string; resolution: "dismissed" | "corrected"; note: string }
  >({
    mutationFn: ({ id, resolution, note }) =>
      adminSend("PATCH", `/flagged-scans/${id}`, { resolution, note }, "Gagal menyelesaikan kasus"),
    onSuccess: () => {
      setNote("");
      setActiveId(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "flagged"] });
    },
  });

  const items = queue.data?.items ?? [];

  return (
    <>
      <TopBar title="Pindai ditandai" meta="status = flagged" />
      <main className="k-admin-content">
        <div className="k-board k-board--single">
          <Panel
            label="Antrian belum selesai"
            chip={queue.data ? `${items.length} kasus` : undefined}
          >
            {queue.isPending && (
              <Note>Memuat antrian…</Note>
            )}
            {queue.isError && queue.error.status === 401 && (
              <Note>
                Belum masuk sebagai admin.{" "}
                <BtnLink href="/admin/masuk" variant="ghost">
                  Masuk
                </BtnLink>
              </Note>
            )}
            {queue.isError && queue.error.status !== 401 && (
              <Note error>{queue.error.message}.</Note>
            )}
            {queue.data && items.length === 0 && (
              <>
                <PaintedTotal value="0" unit="kasus" tone="ok" />
                <Note>Tidak ada pemindaian ditandai — antrian bersih.</Note>
              </>
            )}
            {queue.data &&
              items.map((s) => (
                <div key={s.id} style={{ borderBottom: "var(--hairline)", paddingBottom: 10, marginBottom: 10 }}>
                  <div className="k-row" style={{ borderBottom: "none" }}>
                    <span className="k-row-label">
                      {scanTypeLabel(s.type)}
                      <span className="k-row-sub">
                        {s.flagReason ?? "tanpa alasan"} · outlet {shortId(s.outletId)} · staf{" "}
                        {shortId(s.staffId)}
                      </span>
                    </span>
                    <span className="k-row-val">{fmtWibStamp(s.occurredAt)}</span>
                  </div>
                  <p className="k-page-head" style={{ margin: "4px 0 8px", fontSize: 11 }}>
                    Event perangkat <span className="k-chip quiet">{shortId(s.clientEventId)}</span>{" "}
                    — ditandai oleh aturan offline-sync; setiap penyelesaian tercatat di audit log.
                  </p>
                  {activeId === s.id ? (
                    <form
                      className="k-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (note.trim().length === 0) return;
                        resolve.mutate({ id: s.id, resolution, note: note.trim() });
                      }}
                    >
                      <Field label="Keputusan">
                        <Select
                          value={resolution}
                          onChange={(e) =>
                            setResolution(e.target.value as "dismissed" | "corrected")
                          }
                        >
                          <option value="corrected">corrected — data event dikoreksi</option>
                          <option value="dismissed">dismissed — ditandai keliru</option>
                        </Select>
                      </Field>
                      <Field label="Catatan" hint="wajib, masuk audit log">
                        <Textarea
                          required
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Alasan keputusan…"
                        />
                      </Field>
                      {resolve.isError && <Note error>{resolve.error.message}</Note>}
                      <Actions>
                        <Btn type="submit" disabled={resolve.isPending || note.trim().length === 0}>
                          {resolve.isPending ? "Menyimpan…" : "Selesaikan kasus"}
                        </Btn>
                        <Btn variant="ghost" onClick={() => setActiveId(null)}>
                          Batal
                        </Btn>
                      </Actions>
                    </form>
                  ) : (
                    <Actions>
                      <Btn onClick={() => setActiveId(s.id)}>Selesaikan</Btn>
                    </Actions>
                  )}
                </div>
              ))}
            {queue.data?.nextCursor && (
              <Actions>
                <Btn variant="ghost" onClick={() => setCursor(queue.data!.nextCursor)}>
                  Muat 25 berikutnya
                </Btn>
              </Actions>
            )}
          </Panel>
        </div>
      </main>
    </>
  );
}
