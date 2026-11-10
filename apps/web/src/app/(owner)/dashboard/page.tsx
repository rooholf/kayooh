"use client";

/**
 * /owner/dashboard — Poster Solidaritas (Pemilik) overview.
 *
 * Fully responsive: phone-first (390×844 target, 360 px min) adapting
 * seamlessly to tablet and desktop viewports, matching
 * apps/web/.impeccable/mocks/decision/grounded-poster-solidaritas.html.
 *
 * Backed by GET /api/v1/owner/dashboard/summary (prod, requires owner session)
 * or GET /api/v1/dev/owner/dashboard/summary?ownerId=<uuid> (dev).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { OwnerBorder } from "./_components/Border";
import { OwnerTopBar } from "./_components/TopBar";
import { OutletStrip } from "./_components/OutletStrip";
import { PeriodTabs, type PeriodTab } from "./_components/PeriodTabs";
import { AccrualPlate } from "./_components/AccrualPlate";
import { FleetGrid } from "./_components/FleetGrid";
import { RhythmBands } from "./_components/RhythmBands";
import { OpenRentals } from "./_components/OpenRentals";
import { LateAlert } from "./_components/LateAlert";
import { OwnerFooter } from "./_components/Footer";
import { DashboardSkeleton } from "./_components/Skeleton";
import type { DashboardSummary } from "./_lib/types";

/** First seeded owner — dev convenience. */
const DEV_OWNER_ID = "860d31d5-3233-4889-8c34-5818fddb55a5";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

async function fetchSummary(): Promise<DashboardSummary> {
  // In production with an active owner session, call the proxy pipe.
  try {
    const res = await fetch("/api/owner/dashboard/summary");
    if (res.ok) {
      return (await res.json()) as DashboardSummary;
    }
  } catch {
    // Pipe unreachable or unauthenticated; fall through to dev preview.
  }

  // Dev preview fallback (first seeded owner).
  const devUrl = `${API_BASE}/api/v1/dev/owner/dashboard/summary?ownerId=${DEV_OWNER_ID}`;
  const devRes = await fetch(devUrl);
  if (!devRes.ok) throw new Error(`Dashboard fetch failed (${devRes.status})`);
  return devRes.json() as Promise<DashboardSummary>;
}

export default function OwnerDashboardPage() {
  const [period, setPeriod] = useState<PeriodTab>("PEKAN");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["owner", "dashboard", "summary"],
    queryFn: fetchSummary,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <main className="owner-desk">
        <OwnerBorder />
        <OwnerTopBar />
        <DashboardSkeleton />
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="owner-desk">
        <OwnerBorder />
        <OwnerTopBar />
        <div className="owner-empty">Gagal memuat data dashboard.</div>
      </main>
    );
  }

  // Aggregate fleet across all outlets
  const fleetCounts = aggregateFleet(data);
  const totalBikes = Object.values(fleetCounts).reduce((a, b) => a + b, 0);
  const allRentals = data.outlets.flatMap((o) => o.openRentals);
  const totalLate = data.outlets.reduce((a, o) => a + o.lateReturns, 0);

  // Use first outlet for outlet strip (single-outlet P1)
  const outlet = data.outlets[0];

  return (
    <main className="owner-desk">
      <OwnerBorder />
      <OwnerTopBar />
      {outlet && (
        <OutletStrip name={outlet.name} totalBikes={totalBikes} />
      )}
      <PeriodTabs activeTab={period} onChange={setPeriod} />

      <div className="owner-main-grid">
        <div className="owner-grid-plate">
          <AccrualPlate grossIdr={data.grossAccruedIdr} period={period} />
        </div>
        <div className="owner-grid-fleet">
          <FleetGrid counts={fleetCounts} totalBikes={totalBikes} />
        </div>
        <div className="owner-grid-bands">
          <RhythmBands />
        </div>
        <div className="owner-grid-rentals">
          {totalLate > 0 && <LateAlert count={totalLate} />}
          <OpenRentals rentals={allRentals} />
        </div>
      </div>

      <OwnerFooter counts={fleetCounts} totalBikes={totalBikes} />
    </main>
  );
}

/** Aggregate bike states across all outlets into a { state: count } map. */
function aggregateFleet(
  data: DashboardSummary,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const o of data.outlets) {
    for (const c of o.categories) {
      for (const [state, n] of Object.entries(c.bikesByState)) {
        counts[state] = (counts[state] ?? 0) + n;
      }
      // held + confirmed → "tersewa" (rented) display bucket
      const rented = c.heldCount + c.confirmedCount;
      if (rented > 0) {
        counts["rented"] = (counts["rented"] ?? 0) + rented;
      }
    }
  }
  return counts;
}
