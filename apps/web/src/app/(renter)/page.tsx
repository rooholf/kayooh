/**
 * Renter root — the KAYOOH brand sheet (revision 1.3, link-in-bio pivot).
 *
 * In the B2B2C model renters never browse a directory here: owners put their
 * own landing (`/JMB-001`) in their social bios, and the funnel begins there.
 * This root is the brand's launch screen only — a poster that says who is
 * speaking and points at the demo outlet. No catalog, no live counts on this
 * page (the platform-wide renter directory was retired with rev 1.3; the
 * `GET /outlets` API stays for admin/secondary use).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Slogan } from "./_components/Slogan";
import { Bicycle } from "./_components/Bicycle";

export const metadata: Metadata = {
  title: "Kayooh — Sepeda siap, outlet nyata",
  description:
    "Sewa sepeda di Jambi di outlet nyata: cek ketersediaan langsung, pilih waktu dan jenis, ambil di konter dengan QR.",
};

export default function RenterHomePage() {
  return (
    <main>
      <Slogan variant="red" text="SEPEDA SIAP ◆ DI OUTLET NYATA" />
      <Slogan variant="yellow" text="A BIKE IS WAITING ◆ AT A REAL OUTLET" />

      {/* ---- strip: brand + optional account entry (sign-in unlocks promos) ---- */}
      <div className="alat">
        <p className="alat-merek">KAYOOH — POSTER HARIAN</p>
        <Link className="alat-link" href="/masuk">
          Masuk →
        </Link>
      </div>

      {/* ---- the emblem plate ---- */}
      <section className="plate" aria-label="Kayooh Jambi">
        <div className="plate-top">
          <h1 className="masthead">
            KAYOOH<small>JAMBI</small>
          </h1>
        </div>

        <Bicycle />

        <div className="siap">
          <b>Kayooh!</b>
          <span>Pesan Sekarang tinggal datang</span>
        </div>

        <p className="plate-foot">
          Setiap punya outlet punya poster sendiri — buka bio pemiliknya,
          tekan tautannya, pesan di tempat.
        </p>
      </section>

      <Link
        className="aksi"
        href="/JMB-001"
      >
        <span className="aksi-teks">
          <small>Demo · outlet pertama</small>
          <b>Buka poster outlet →</b>
        </span>
        <svg
          className="aksi-panah"
          width="34"
          height="34"
          viewBox="0 0 34 34"
          aria-hidden="true"
        >
          <path
            d="M6 17 H25 M17 6 L28 17 L17 28"
            fill="none"
            stroke="currentColor"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>

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
