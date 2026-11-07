"use client";

/**
 * Renter outlet catalog — FR-CAT-01.
 *
 * Client component backed by TanStack Query so the catalog can be refetched
 * (stale-while-revalidate) without a full navigation. The server remains the
 * only source of availability (INV-1): we only render the counts it returns.
 * NEG-2: only per-category counts are rendered — never bike ids/asset tags.
 *
 * The `kategori` query param pre-selects the filter (outlets with stock in
 * that category); `waktu` is shown as the chosen pickup window — it is
 * context, not a stock filter.
 *
 * Mobile-first (NFR-07): 360 px minimum width, single column, 44 px+ touch
 * targets, WCAG 2.1 AA contrast.
 */
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { OutletListResponse } from "@repo/contracts";
import { Slogan } from "../_components/Slogan";
import { OutletList } from "../_components/OutletList";
import { DemoTag } from "../_components/DemoTag";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  WAKTU_LABEL,
  isCategoryCode,
  isWaktuCode,
  type CategoryCode,
} from "../_components/shared";
import { useLiveAvailability } from "../_hooks/useLiveAvailability";

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

/** Raw fetch failures are not user-facing copy; map them to one honest Indonesian line. */
function catalogErrorMessage(error: Error): string {
  if (error.message.startsWith("Gagal memuat katalog")) {
    return error.message;
  }
  return "Katalog sedang tidak tersedia. Periksa koneksi lalu coba lagi.";
}

function OutletsInner() {
  const searchParams = useSearchParams();
  const paramKategori = searchParams.get("kategori");
  const paramWaktu = searchParams.get("waktu");
  const initialFilter: CategoryCode | null = isCategoryCode(paramKategori)
    ? paramKategori
    : null;
  const waktu = isWaktuCode(paramWaktu) ? WAKTU_LABEL[paramWaktu] : null;

  const [filter, setFilter] = useState<CategoryCode | null>(initialFilter);

  // FR-REP-02: the SSE stream patches the ["outlets"] cache in place as the
  // server commits state changes — counts move without any refetch.
  useLiveAvailability();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["outlets"],
    queryFn: fetchOutlets,
  });

  const outlets = useMemo(() => data?.outlets ?? [], [data]);
  const visible = useMemo(() => {
    if (filter === null) return outlets;
    return outlets.filter(
      (o) => (o.availability[filter] ?? 0) > 0,
    );
  }, [outlets, filter]);

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
          aria-label="Muat ulang katalog"
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

      <section className="katalog katalog--flush" aria-labelledby="katalog-judul">
        <h1 className="katalog-band" id="katalog-judul">
          Ketersediaan Outlet
        </h1>
        <p className="katalog-sub">
          Dihitung oleh server dan diperbarui langsung saat stok berubah.{" "}
          <b>Bukan dari salinan di perangkatmu.</b>
        </p>
        <DemoTag />
      </section>

      {(waktu !== null || filter !== null) && (
        <p className="jendela">
          {waktu && (
            <span>
              Jendela ambil: <b>{waktu}</b>
            </span>
          )}
          {filter !== null && (
            <span>
              Pilihan: <b>{CATEGORY_LABEL[filter]}</b>
            </span>
          )}
        </p>
      )}

      <div
        className="filter-baris"
        role="group"
        aria-label="Saring per jenis sepeda"
      >
        <button
          type="button"
          aria-pressed={filter === null}
          onClick={() => setFilter(null)}
        >
          Semua
        </button>
        {CATEGORY_ORDER.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={filter === c}
            onClick={() => setFilter(filter === c ? null : c)}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <section className="katalog katalog--list" aria-label="Daftar outlet">
        {isLoading ? (
          <p className="notice" role="status">Memuat katalog…</p>
        ) : isError ? (
          <div className="notice notice--merah" role="alert">
            <p>
              {error instanceof Error
                ? catalogErrorMessage(error)
                : "Katalog sedang tidak tersedia. Periksa koneksi lalu coba lagi."}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="notice-recovery"
            >
              Coba lagi
            </button>
          </div>
        ) : outlets.length === 0 ? (
          <p className="notice" role="status">Belum ada outlet terdaftar.</p>
        ) : visible.length === 0 ? (
          <div className="notice" role="status">
            Tidak ada outlet dengan{" "}
            <b>{filter ? CATEGORY_LABEL[filter] : ""}</b> siap saat ini.{" "}
            <button
              type="button"
              onClick={() => setFilter(null)}
              className="text-action"
            >
              Tampilkan semua outlet
            </button>
          </div>
        ) : (
          <OutletList outlets={visible} selectedCategory={filter ?? undefined} headingLevel="h2" />
        )}
      </section>

      <Link className="kembali" href="/">
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
        Kembali ke poster
      </Link>
    </main>
  );
}

export default function OutletsPage() {
  return (
    <Suspense fallback={<p className="notice notice--spaced" role="status">Memuat katalog…</p>}>
      <OutletsInner />
    </Suspense>
  );
}
