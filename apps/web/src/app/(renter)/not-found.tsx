/**
 * (renter) not-found — the poster-honest 404 (FR-CAT-01 rev 1.3).
 *
 * An unknown or inactive outlet code is a dead bio link. It gets a real
 * sheet, never a bare framework error: say what went wrong, give the one
 * recovery path (the brand root), and nothing else (no invented fallback
 * outlet — NEG-8 spirit).
 */
import Link from "next/link";
import { Slogan } from "./_components/Slogan";
import { DemoTag } from "./_components/DemoTag";

export default function RenterNotFound() {
  return (
    <main>
      <Slogan variant="red" text="TUTUP ◆ TIDAK ADA POSTER DI ALAMAT INI" />
      <Slogan variant="yellow" text="LINK WRONG ◆ OR THE OUTLET MOVED ON" />

      <div className="alat">
        <p className="alat-merek">KAYOOH — 404</p>
      </div>

      <section className="status-papan">
        <h1 className="langkah-judul">Poster tidak ditemukan</h1>
        <p className="notice" role="status">
          <b>Tautan ini tidak menunjuk ke outlet terdaftar.</b> Bisa salah
          ketik, atau outlet sudah tidak aktif. Mulai dari poster KAYOOH
          untuk menemukan outlet demo.
        </p>
        <Link className="kembali" href="/">
          ← Poster KAYOOH
        </Link>
      </section>

      <DemoTag />

      <footer className="kaki">
        <p className="kaki-merek">KAYOOH — dari “kayuh”, mengayuh.</p>
      </footer>
    </main>
  );
}
