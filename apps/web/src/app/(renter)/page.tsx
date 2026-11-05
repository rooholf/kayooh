/**
 * Renter catalog home — FR-CAT-01 (outlet discovery).
 *
 * Mobile-first (NFR-07): single column, 360 px minimum width, 44 px+ touch
 * targets, AA contrast. The list shows per-category availability COUNTS only
 * — the catalog never receives bike ids or asset tags (NEG-2), and any
 * renter coordinates used for sorting stay in the API request (NEG-4).
 */
import type { OutletListResponse } from "@repo/contracts";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

async function fetchOutlets(): Promise<OutletListResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/outlets`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as OutletListResponse;
  } catch {
    return null;
  }
}

export default async function RenterHomePage() {
  const data = await fetchOutlets();

  return (
    <main className="flex flex-1 flex-col px-4 pb-8 pt-6">
      <h1 className="text-2xl font-bold tracking-tight">Sewa Sepeda Jambi</h1>
      <p className="mt-1 text-sm text-slate-600">
        Pilih outlet untuk melihat ketersediaan sepeda.
      </p>

      {data === null ? (
        <p className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Katalog sedang tidak tersedia. Coba lagi nanti.
        </p>
      ) : data.outlets.length === 0 ? (
        <p className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Belum ada outlet terdaftar.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {data.outlets.map((outlet) => (
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
                  {Object.entries(outlet.availability)
                    .map(([category, n]) => `${category}: ${n}`)
                    .join(" · ")}
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
