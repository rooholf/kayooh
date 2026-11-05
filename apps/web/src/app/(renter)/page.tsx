/**
 * Renter home — Poster Solidaritas.
 *
 * Mobile-first (NFR-07): single column, 360 px minimum width, 44 px+ touch
 * targets, AA contrast. The list shows per-category availability COUNTS only
 * — the catalog never receives bike ids or asset tags (NEG-2), and any
 * renter coordinates used for sorting stay in the API request (NEG-4).
 * The "siap" figure on the plate is computed from the live response; when
 * the fetch fails the poster says so instead of inventing a number.
 */
import type { Metadata } from "next";
import Link from "next/link";
import type { OutletListResponse } from "@repo/contracts";
import { Slogan } from "./_components/Slogan";
import { Bicycle } from "./_components/Bicycle";
import { PosterPicker } from "./_components/PosterPicker";
import { OutletList } from "./_components/OutletList";
import { DemoTag } from "./_components/DemoTag";
import { totalUnits, wibDateParts } from "./_components/shared";

export const metadata: Metadata = {
  title: "Kayooh — Sepeda siap, outlet nyata",
  description:
    "Sewa sepeda di Jambi di outlet nyata: cek ketersediaan langsung, pilih waktu dan jenis, ambil di konter dengan QR.",
};

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
  const outlets = data?.outlets ?? [];
  const units = totalUnits(outlets);
  const openCount = outlets.filter((o) => o.isOpenNow).length;
  const { weekday, dayMonth } = wibDateParts();

  return (
    <main>
      <Slogan variant="red" text="SEPEDA SIAP ◆ DI OUTLET NYATA" />
      <Slogan variant="yellow" text="A BIKE IS WAITING ◆ AT A REAL OUTLET" />

      {/* ---- the emblem plate ---- */}
      <section className="plate" aria-label="Kayooh Jambi">
        <div className="plate-top">
          <h1 className="masthead">
            KAYOOH<small>JAMBI</small>
          </h1>
          <p className="tanggal">
            <b>{weekday}</b>
            <i>{dayMonth}</i>
          </p>
        </div>

        <Bicycle />

        {data === null ? (
          <div className="plate-note" role="alert">
            Katalog sedang tidak tersedia — angka sepeda siap tidak bisa
            dihitung sekarang. <a className="notice-link-action" href="/">Muat ulang</a>
          </div>
        ) : (
          <div className="siap">
            <b>{units}</b>
            <span>
              unit siap hari ini · {openCount} dari {outlets.length} outlet
              buka
            </span>
          </div>
        )}

        <p className="plate-foot">
          Angka ini datang dari <b>satu transaksi di server</b>, bukan dari
          salinan di ponselmu.
        </p>
      </section>

      {/* ---- waktu & jenis + the boxed-ink action ---- */}
      <PosterPicker dayMonth={dayMonth} />

      {/* ---- real outlet names, ruled ---- */}
      {outlets.length > 0 && (
        <p className="nama-strip">
          {outlets.map((o) => (
            <span key={o.id}>{o.name}</span>
          ))}
        </p>
      )}

      {/* ---- live catalog ---- */}
      <section className="katalog" aria-labelledby="katalog-judul">
        <h2 className="katalog-band" id="katalog-judul">
          Ketersediaan Langsung
        </h2>
        <p className="katalog-sub">
          Dihitung oleh server saat kamu membuka halaman ini.{" "}
          <b>Bukan dari salinan di perangkatmu.</b>
        </p>
        <DemoTag />

        {data === null ? (
          <p className="notice notice--merah" role="alert">
            Katalog sedang tidak tersedia. Coba lagi nanti —{" "}
            <Link href="/">muat ulang halaman</Link>.
          </p>
        ) : outlets.length === 0 ? (
          <p className="notice">Belum ada outlet terdaftar.</p>
        ) : (
          <OutletList outlets={outlets} />
        )}
      </section>

      {/* ---- sheet foot ---- */}
      <footer className="kaki">
        <p className="kaki-merek">KAYOOH — dari “kayuh”, mengayuh.</p>
        <p className="kaki-baris">
          Sepeda siap di outlet nyata. Ambil di konter dengan pindaian QR,
          kembalikan di outlet milik owner yang sama. Ketersediaan selalu
          dihitung oleh server.
        </p>
      </footer>
    </main>
  );
}
