"use client";

/**
 * /admin — DASHBOARD JARINGAN, the market board (DESIGN.md FIRST VIEWPORT).
 *
 * Two ruled panels side by side — availability by outlet (left) and money
 * (right) — each ending in a painted mono total; beneath them the case
 * queue (real flagged scans + the P2 case modules) and the last audit
 * entries. Every figure is server truth: availability from the public
 * catalog, the queue from GET /admin/flagged-scans, the tail from
 * GET /admin/audit-log. The board never invents a number — money rows are
 * honest P2 placeholders until the settlement module exists.
 */
import { useQuery } from "@tanstack/react-query";
import { TopBar } from "../_components/TopBar";
import {
  Actions,
  BtnLink,
  Entry,
  Note,
  PaintedTotal,
  Panel,
  Row,
  SkeletonRows,
} from "../_components/ui";
import { adminGet, ApiError, fetchOutlets, type OutletListItem } from "../_lib/api";
import { fmtInt, scanTypeLabel, shortId } from "../_lib/format";

interface FlaggedPage {
  items: Array<{
    id: string;
    type: string;
    outletId: string | null;
    flagReason: string | null;
    occurredAt: string;
    resolution: string | null;
  }>;
  nextCursor: string | null;
}

interface AuditPage {
    items: Array<{
      id: string;
      actorId: string | null;
      actorRole: string;
      action: string;
      entity: string;
      entityId: string | null;
      createdAt: string;
    }>;
    nextCursor: string | null;
  }

/** Panel-level signed-out state: the queue exists, the session doesn't. */
function SignInNote() {
  return (
    <Note>
      Belum masuk sebagai admin — antrian dan audit log butuh sesi admin.{" "}
      <BtnLink href="/admin/masuk" variant="ghost">
        Masuk
      </BtnLink>
    </Note>
  );
}

export default function AdminDashboardPage() {
  const outlets = useQuery<OutletListItem[], ApiError>({
    queryKey: ["admin", "outlets"],
    queryFn: fetchOutlets,
    refetchInterval: 60_000,
  });

  const flagged = useQuery<FlaggedPage, ApiError>({
    queryKey: ["admin", "flagged"],
    queryFn: () => adminGet<FlaggedPage>("/flagged-scans?limit=50", "Gagal memuat antrian"),
    refetchInterval: 60_000,
  });

  const audit = useQuery<AuditPage, ApiError>({
    queryKey: ["admin", "audit", "tail"],
    queryFn: () => adminGet<AuditPage>("/audit-log?limit=5", "Gagal memuat audit log"),
  });

  const outletRows = outlets.data ?? [];
  const perOutlet = outletRows.map((o) => ({
    outlet: o,
    available: Object.values(o.availability).reduce((a, b) => a + b, 0),
  }));
  const totalAvailable = perOutlet.reduce((a, r) => a + r.available, 0);

  const flaggedItems = flagged.data?.items ?? [];
  const pendingFlagged = flaggedItems.length;
  const flaggedTail = flaggedItems.slice(0, 4);

  const isSignedIn = !flagged.error || flagged.error.status !== 401;

  return (
    <>
      <TopBar title="Dashboard jaringan" />
      <main className="k-admin-content">
        <div className="k-board">
          {/* Panel 1 — availability by outlet, the left painted total. */}
          <Panel
            label="Ketersediaan per outlet"
            chip={outlets.data ? `${fmtInt(outletRows.length)} outlet` : undefined}
          >
            {outlets.isPending && <SkeletonRows rows={4} />}
            {outlets.isError && (
              <Note error>
                {outlets.error.message}. Periksa server API, lalu muat ulang halaman.
              </Note>
            )}
            {outlets.data && (
              <>
                {perOutlet.map((r) => (
                  <Row
                    key={r.outlet.id}
                    label={`${r.outlet.name} · ${r.outlet.code}`}
                    value={fmtInt(r.available)}
                    tone={r.available > 0 ? "ok" : "warn"}
                  />
                ))}
                <PaintedTotal
                  value={fmtInt(totalAvailable)}
                  unit="tersedia"
                  tone={totalAvailable > 0 ? "ok" : "warn"}
                />
                <Actions>
                  <BtnLink href="/admin/outlet">+ Onboard outlet</BtnLink>
                  <BtnLink href="/admin/sepeda" variant="ghost">
                    Onboard sepeda
                  </BtnLink>
                </Actions>
              </>
            )}
          </Panel>

          {/* Panel 2 — money, the right painted total. P2: honest dash. */}
          <Panel label="Uang jaringan" chip="P2">
            <Row label="Booking masuk" value="—" />
            <Row label="Refund tertunda" value="—" />
            <Row label="Settlement pekan lalu" value="—" />
            <PaintedTotal value="—" unit="menunggu P2" />
            <Note>
              Angka uang mengikuti modul settlement (P2). Papan tidak menampilkan nilai
              rekaan — rupiah yang tampil selalu integer dari server (INV-5).
            </Note>
          </Panel>

          {/* Panel 3 — the case queue: real flagged scans + P2 cases. */}
          <Panel
            label="Antrian kasus"
            chip={flagged.data ? `${fmtInt(pendingFlagged)} menunggu` : undefined}
          >
            {flagged.isPending && <SkeletonRows rows={4} />}
            {flagged.data && (
              <>
                {flaggedTail.map((s) => (
                  <Entry
                    key={s.id}
                    label={`${scanTypeLabel(s.type)} · ${s.flagReason ?? "tanpa alasan"} · ${shortId(
                      s.outletId,
                    )}`}
                    tag="menunggu"
                    tagAlarm
                  />
                ))}
                {pendingFlagged === 0 && <Note>Tidak ada pemindaian ditandai.</Note>}
                {pendingFlagged > flaggedTail.length && (
                  <Note>
                    {fmtInt(pendingFlagged - flaggedTail.length)} lagi di antrian.
                  </Note>
                )}
                <Note>
                  Sengketa dan klaim rusak dibuka dari modul ledger (P2).
                </Note>
                <PaintedTotal
                  value={fmtInt(pendingFlagged)}
                  unit="kasus"
                  tone={pendingFlagged > 0 ? "warn" : "ok"}
                />
                <Actions>
                  <BtnLink href="/admin/flagged">Review antrian</BtnLink>
                </Actions>
              </>
            )}
            {flagged.isError && flagged.error.status === 401 && <SignInNote />}
            {flagged.isError && flagged.error.status !== 401 && (
              <Note error>{flagged.error.message}.</Note>
            )}
          </Panel>

          {/* Panel 4 — the audit tail: every mutation is audit-logged (INV-6). */}
          <Panel label="Aktivitas terakhir" chip="audit">
            {audit.isPending && <SkeletonRows rows={4} />}
            {audit.data &&
              (audit.data.items.length === 0 ? (
                <Note>Belum ada perubahan tercatat.</Note>
              ) : (
                audit.data.items.map((a) => (
                  <Row
                    key={a.id}
                    label={
                      <>
                        {a.action}
                        <span className="k-row-sub">
                          {a.entity}
                          {a.entityId ? ` · ${shortId(a.entityId)}` : ""}
                        </span>
                      </>
                    }
                    value={shortId(a.actorId)}
                  />
                ))
              ))}
            {audit.isError && audit.error.status === 401 && <SignInNote />}
            {audit.isError && audit.error.status !== 401 && (
              <Note error>{audit.error.message}.</Note>
            )}
            <Actions>
              <BtnLink href="/admin/audit" variant="ghost">
                Buka audit log
              </BtnLink>
            </Actions>
          </Panel>
        </div>
        {!isSignedIn && (
          <p className="k-page-head" style={{ marginTop: 16 }}>
            Sesi admin belum aktif — panel antrian dan audit menunggu masuk.
          </p>
        )}
      </main>
    </>
  );
}
