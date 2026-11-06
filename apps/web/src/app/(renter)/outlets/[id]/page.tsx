"use client";

/**
 * Renter outlet detail — the catalog at the outlet.
 *
 * Server counts only (INV-1): this page reuses the ["outlets"] query the
 * poster and the list already hold — no new call, no new endpoint. Four
 * specimen rows carry glyph + type name + this outlet's live count; the
 * selected type is stamped in `?jenis=` (a later reservation round picks it
 * up). NEG-2: counts only, never bike ids. NEG-4: no coordinates sent.
 *
 * Mobile-first (NFR-07): 360 px minimum, 44 px+ targets, AA contrast.
 */
import { Suspense, useLayoutEffect, useMemo } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { OutletListResponse } from "@repo/contracts";
import { Slogan } from "../../_components/Slogan";
import { BikeSpecimen } from "../../_components/BikeSpecimen";
import { DemoTag } from "../../_components/DemoTag";
import {
  CATEGORY_ORDER,
  availabilityCount,
  formatDistanceKm,
  formatTodayHours,
  isCategoryCode,
  type CategoryCode,
} from "../../_components/shared";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

async function fetchOutlets(): Promise<OutletListResponse> {
  const res = await fetch(`${API_BASE}/api/v1/outlets`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Gagal memuat outlet (HTTP ${res.status}).`);
  }
  return (await res.json()) as OutletListResponse;
}

/** Raw fetch failures are not user-facing copy; map them to one honest Indonesian line. */
function detailErrorMessage(error: Error): string {
  if (error.message.startsWith("Gagal memuat outlet")) {
    return error.message;
  }
  return "Outlet sedang tidak tersedia. Periksa koneksi lalu coba lagi.";
}

function OutletDetailInner() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = Array.isArray(params.id) ? (params.id[0] ?? "") : (params.id as string | null) ?? "";

  const paramJenis = searchParams.get("jenis");
  const selected: CategoryCode = isCategoryCode(paramJenis) ? paramJenis : "commuter";

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["outlets"],
    queryFn: fetchOutlets,
  });

  const outlet = useMemo(
    () => data?.outlets.find((o) => o.id === id) ?? null,
    [data, id],
  );

  // The default jenis (no query) writes itself into the URL so a later round
  // and this page share one reading of the selection.
  useLayoutEffect(() => {
    if (paramJenis === null) {
      const qs = new URLSearchParams(searchParams.toString());
      qs.set("jenis", selected);
      router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
    }
  }, [paramJenis, pathname, router, searchParams, selected]);

  function selectJenis(category: CategoryCode) {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("jenis", category);
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
  }

  const jamHariIni = outlet ? formatTodayHours(outlet.hours) : null;

  const showBody = !isLoading && !isError && outlet !== null;

  return (
    <main>
      <Slogan variant="red" text="SEPEDA SIAP ◆ DI OUTLET NYATA" />
      <Slogan variant="yellow" text="A BIKE IS WAITING ◆ AT A REAL OUTLET" />

      <div className="alat">
        <p className="alat-merek">KAYOOH — JAMBI</p>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="muat-ulang"
          aria-label="Muat ulang outlet"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path
              d="M12.5 7a5.5 5.5 0 1 1-1.61-3.89M12.5 1.5v3h-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {isFetching ? "Memuat…" : "Muat ulang"}
        </button>
      </div>

      <section className="katalog katalog--flush" aria-labelledby="outlet-judul">
        {isLoading ? (
          <p className="notice" role="status">
            Memuat outlet…
          </p>
        ) : isError ? (
          <div className="notice notice--merah" role="alert">
            <p>
              {error instanceof Error
                ? detailErrorMessage(error)
                : "Outlet sedang tidak tersedia. Periksa koneksi lalu coba lagi."}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="notice-recovery"
            >
              Coba lagi
            </button>
          </div>
        ) : outlet === null ? (
          <div className="notice" role="status">
            <p>
              <b>Outlet tidak ditemukan.</b> Tautan ini mungkin sudah
              berubah. Kembali ke daftar untuk memilih outlet yang ada.
            </p>
          </div>
        ) : (
          <>
            <div className="outlet-identifikasi">
              <div className="pos-head">
                <div>
                  <h1 className="pos-nama" id="outlet-judul">
                    {outlet.name}
                  </h1>
                  <p className="pos-alamat">{outlet.address}</p>
                  {outlet.distanceKm !== undefined && (
                    <p className="pos-jarak">{formatDistanceKm(outlet.distanceKm)}</p>
                  )}
                </div>
                <span
                  className={`chip ${outlet.isOpenNow ? "chip--buka" : "chip--tutup"}`}
                >
                  {outlet.isOpenNow ? "Buka" : "Tutup"}
                </span>
              </div>

              <p className="outlet-jam" aria-label="Jam buka hari ini">
                {jamHariIni !== null ? (
                  <>
                    Hari ini <b>{jamHariIni} WIB</b>
                  </>
                ) : (
                  "Jam buka hari ini belum diumumkan outlet ini."
                )}
              </p>
              {outlet.description !== null && outlet.description !== undefined && (
                <p className="outlet-ciri">{outlet.description}</p>
              )}
            </div>

            <DemoTag />
          </>
        )}
      </section>

      {showBody && outlet !== null && (
        <>
          <section className="katalog" aria-labelledby="spesimen-judul">
            <h2 className="katalog-band" id="spesimen-judul">
              Sepeda di outlet ini
            </h2>
            <p className="katalog-sub">
              Dihitung oleh server saat halaman dibuka.{" "}
              <b>Bukan dari salinan di perangkatmu.</b>
            </p>
            <ul className="spesimen-daftar">
              {CATEGORY_ORDER.map((category) => (
                <BikeSpecimen
                  key={category}
                  mode="detail"
                  category={category}
                  count={availabilityCount(outlet, category)}
                  selected={selected === category}
                  onSelect={selectJenis}
                />
              ))}
            </ul>
          </section>

          <p className="serah-terima">
            Ambil di konter outlet dengan pindaian QR. Hanya kehadiran staf
            yang memindahkan sepeda — tidak ada cara lain.
          </p>

          <Link
            className="kembali"
            href={`/booking?outlet=${outlet.id}&category=${selected}`}
          >
            Pesan {selected.toUpperCase()} di outlet ini →
          </Link>

          <Link className="kembali" href="/outlets">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M10 3 L4 8 L10 13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Kembali ke katalog
          </Link>
        </>
      )}
    </main>
  );
}

export default function OutletDetailPage() {
  return (
    <Suspense fallback={<p className="notice notice--spaced" role="status">Memuat outlet…</p>}>
      <OutletDetailInner />
    </Suspense>
  );
}
