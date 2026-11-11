import { useEffect, useMemo, useState } from "react";
import { LedgerBoard } from "./components/ledger";
import { ScanSheet, type ScanDraft, type ScanMode } from "./components/scan-sheet";
import { AppBar, TabBar } from "./components/shell";
import { CapNotice, StockCard } from "./components/stock-card";
import {
  QUEUE_CAPACITY,
  enqueueEvent,
  listEvents,
  queuedCount,
  type ScanEventPayload,
} from "./db/scan-events";
import { boot, outletContext } from "./lib/boot";
import { buildLedger } from "./lib/ledger";
import { useLiveQuery, useSyncSnapshot } from "./lib/live";
import type { TabId } from "./lib/nav";
import { syncEngine } from "./sync/engine";
import { AccountView, InspectionsView, QueueView } from "./views/panels";
import { BikesView, ExpectedView, OverdueView } from "./views/outlet-reads";

export function App() {
  const [tab, setTab] = useState<TabId>("sepeda");
  const [sheet, setSheet] = useState<{ mode: ScanMode; focus: "voucher" | "tag" } | null>(null);

  const snapshot = useSyncSnapshot();
  const events = useLiveQuery(() => listEvents(), [], []);
  const queued = useLiveQuery(() => queuedCount(), [], 0);

  useEffect(() => {
    void boot();
  }, []);

  const all = events ?? [];
  const queuedCountNow = queued ?? 0;
  const blocked = queuedCountNow >= QUEUE_CAPACITY;
  const rows = useMemo(() => buildLedger(all, outletContext.openingBalance), [all]);
  const hasSample = all.some((event) => event.synthetic);

  async function handleSubmit(draft: ScanDraft) {
    // One wire payload per event type (packages/contracts staff.ts, strict):
    // each event carries only its own type's keys — the server rejects
    // anything else at sync (FR-OFF-01.3).
    let payload: ScanEventPayload = {};
    switch (draft.type) {
      case "checkout":
        payload = {
          bikeAssetTags: draft.assetTags,
          ...(draft.voucherToken ? { voucherToken: draft.voucherToken } : {}),
          ...(draft.checklist ? { checklist: draft.checklist } : {}),
          ...(draft.photoKeys ? { photoKeys: draft.photoKeys } : {}),
          ...(draft.collateral ? { collateral: draft.collateral } : {}),
          ...(draft.balanceCollection ? { balanceCollection: draft.balanceCollection } : {}),
        };
        break;
      case "checkin":
        // INV-3: bike tag only — no renter/phone, and no late-fee field;
        // the server computes the fee from the rental's expected end.
        payload = { bikeAssetTag: draft.assetTags[0] };
        break;
      case "inspection":
        payload = {
          rentalId: draft.rentalId,
          result: draft.result,
          ...(draft.checklist ? { checklist: draft.checklist } : {}),
          ...(draft.photoKeys ? { photoKeys: draft.photoKeys } : {}),
          ...(draft.damageDescription ? { damageDescription: draft.damageDescription } : {}),
        };
        break;
      case "bike_status_change":
        payload = {
          bikeAssetTag: draft.assetTags[0],
          to: draft.to,
          reason: draft.reason,
        };
        break;
      case "incident":
        payload = {
          incidentType: draft.incidentType,
          bikeAssetTag: draft.assetTags[0],
          notes: draft.notes,
          ...(draft.photoKeys ? { photoKeys: draft.photoKeys } : {}),
        };
        break;
    }
    await enqueueEvent({ type: draft.type, payload });
    syncEngine.kick();
    setSheet(null);
  }

  return (
    <div className="flex min-h-full justify-center bg-desk">
      <div className="relative flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-card sm:border-x-2 sm:border-ink">
        <AppBar />

        <main className="flex min-h-0 flex-1 flex-col">
          {tab === "sepeda" && (
            <>
              <StockCard
                outlet={outletContext.outlet}
                dateLabel={outletContext.dateLabel}
                category={outletContext.category}
                staff={outletContext.staff}
                queued={queuedCountNow}
                running={snapshot.running}
                online={snapshot.online}
                hasSample={hasSample}
              />
              <BikesView />
              <LedgerBoard rows={rows} />
            </>
          )}

          {tab === "antrean" && (
            <QueueView
              events={all}
              snapshot={snapshot}
              onRetry={() => syncEngine.kick()}
            />
          )}

          {tab === "periksa" && <InspectionsView events={all} />}

          {tab === "lambat" && <OverdueView />}

          {tab === "terjadwal" && <ExpectedView />}

          {tab === "akun" && <AccountView queued={queuedCountNow} snapshot={snapshot} />}
        </main>

        <CapNotice queued={queuedCountNow} />

        <div className="flex flex-none gap-2 border-t-2 border-ink px-3 py-[10px]">
          <button
            type="button"
            disabled={blocked}
            onClick={() => setSheet({ mode: "checkout", focus: "voucher" })}
            className="min-h-[48px] flex-1 border-2 border-rule bg-rule font-sans text-[13px] font-semibold tracking-[0.02em] text-card disabled:cursor-not-allowed disabled:border-ink/30 disabled:bg-transparent disabled:text-ink/40"
          >
            Mulai serah terima
          </button>
          <button
            type="button"
            disabled={blocked}
            onClick={() => setSheet({ mode: "checkout", focus: "tag" })}
            className="min-h-[48px] w-[92px] border-2 border-ink font-sans text-[13px] font-semibold tracking-[0.02em] text-ink disabled:cursor-not-allowed disabled:border-ink/30 disabled:text-ink/40"
          >
            Pindai
          </button>
        </div>

        <TabBar active={tab} onChange={setTab} queueBadge={queuedCountNow} />

        {sheet && (
          <ScanSheet
            mode={sheet.mode}
            focus={sheet.focus}
            blocked={blocked}
            onClose={() => setSheet(null)}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}
