"use client";

/**
 * Renter outlet discovery — FR-CAT-01.
 *
 * Client component backed by TanStack Query so the catalog can be refetched
 * (stale-while-revalidate) without a full navigation. The server remains the
 * only source of availability (INV-1): we only render the counts it returns.
 * NEG-2: only per-category counts are rendered — never bike ids/asset tags.
 *
 * Mobile-first (NFR-07): 360 px minimum width, single column, 44 px+ touch
 * targets, WCAG 2.1 AA contrast.
 */
import { useQuery } from "@tanstack/react-query";
import type { OutletListResponse } from "@repo/contracts";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

async function fetchOutlets(): Promise<OutletListResponse> {
  const res = await fetch(`${API_BASE}/api/v1/outlets`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Gagal memuat katalog (HTTP ${res.status}).`);
  }
  return (await res.json()) as OutletListResponse;
}

function formatAvailability(availability: Record<string, number>): string {
  const entries = Object.entries(availability);
  if (entries.length === 0) return "Tidak ada sepeda tersedia";
  return entries.map(([category, count]) => `${category}: ${count}`).join(" · ");
}

export default function OutletsPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["outlets"],
    queryFn: fetchOutlets,
  });

  const outlets = data?.outlets ?? [];

  return (
    <main className="flex flex-1 flex-col px-4 pb-8 pt-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sewa Sepeda Jambi</h1>
          <p className="mt-1 text-sm text-slate-600">
            Pilih outlet untuk melihat ketersediaan sepeda.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="mt-1 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900 disabled:opacity-50"
          aria-label="Muat ulang katalog"
        >
          {isFetching ? "Memuat…" : "Muat ulang"}
        </button>
      </header>

      {isLoading ? (
        <p className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Memuat katalog…
        </p>
      ) : isError ? (
        <p
          role="alert"
          className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error instanceof Error
            ? error.message
            : "Katalog sedang tidak tersedia. Coba lagi nanti."}
        </p>
      ) : outlets.length === 0 ? (
        <p className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Belum ada outlet terdaftar.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {outlets.map((outlet) => (
            <li key={outlet.id}>
              <a
                href={`/outlets/${outlet.id}`}
                className="flex min-h-[72px] flex-col gap-1 rounded-lg border border-slate-300 p-4 transition-colors hover:border-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-base font-semibold">{outlet.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      outlet.isOpenNow
                        ? "bg-green-100 text-green-800"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {outlet.isOpenNow ? "Buka" : "Tutup"}
                  </span>
                </span>
                <span className="text-sm text-slate-600">{outlet.address}</span>
                <span className="text-sm text-slate-700">
                  {formatAvailability(outlet.availability)}
                </span>
                {outlet.distanceKm !== undefined && (
                  <span className="text-xs text-slate-600">
                    {outlet.distanceKm.toFixed(1)} km
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}