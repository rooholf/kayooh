"use client";

/**
 * /reservasi — the renter's reservations, active ticket first (A-18).
 *
 * Two honest sources, because a renter may be signed in, a guest, or both:
 *   1. `GET /reservations` — the signed-in renter's own list (session cookie,
 *      forwarded by the same-origin proxy). Guests have no list by design.
 *   2. This device's guest tickets — the reservation ids a `guestToken` was
 *      minted for (stored locally). Guests reach their ticket this way.
 *
 * No bike ids, no coordinates (NEG-2/NEG-4). Mobile-first (NFR-07).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReservationResource } from "@repo/contracts";
import { Slogan } from "../_components/Slogan";
import { CATEGORY_LABEL, type CategoryCode } from "../_components/shared";
import { formatIdr, statusStamp } from "./_lib/format";
import { wibDayMonth, wibWeekday, windowLabel } from "./_lib/schedule";
import { errorCopy } from "./_lib/error-copy";
import { listGuestReservationIds } from "./_lib/guest-token-store";
import { useReservationList } from "./_hooks/useReservationList";

function ReservationRow({ r }: { r: ReservationResource }) {
  const stamp = statusStamp(r.status);
  const category = r.category as CategoryCode;
  const label = CATEGORY_LABEL[category] ?? r.category.toUpperCase();
  return (
    <li>
      <Link className="tiket-baris" href={`/reservasi/${r.id}`}>
        <span className={`tiket-cap tiket-cap--${stamp.tone}`}>{stamp.label}</span>
        <span className="tiket-baris-isi">
          <b>
            {label} · {r.quantity} sepeda
          </b>
          <span>
            {wibWeekday(r.startsAt)} {wibDayMonth(r.startsAt)} ·{" "}
            {windowLabel(r.startsAt, r.endsAt)} WIB
          </span>
          <span>
            Total {formatIdr(r.finalIdr)} · DP online {formatIdr(r.dpIdr)}
          </span>
        </span>
        <span className="tiket-baris-panah" aria-hidden="true">
          →
        </span>
      </Link>
    </li>
  );
}

export default function ReservasiListPage() {
  const list = useReservationList();
  const [knownTickets, setKnownTickets] = useState<string[]>([]);

  useEffect(() => {
    setKnownTickets(listGuestReservationIds());
  }, []);

  const rows = list.data?.pages.flatMap((page) => page.data) ?? [];
  const signedOut = list.isError && list.error.status === 401;

  return (
    <main>
      <Slogan variant="red" text="TIKET AMBIL ◆ SEPEDA SIAP DI OUTLET NYATA" />
      <Slogan variant="yellow" text="A CLAIM TICKET ◆ FOR A REAL OUTLET" />

      <div className="alat">
        <p className="alat-merek">KAYOOH — RESERVASI</p>
        {signedOut && (
          <Link className="alat-link" href="/masuk">
            Masuk →
          </Link>
        )}
        <button
          type="button"
          className="muat-ulang"
          onClick={() => void list.refetch()}
          disabled={list.isFetching}
        >
          {list.isFetching ? "Memuat…" : "Muat ulang"}
        </button>
      </div>

      <section className="status-papan" aria-labelledby="daftar-judul">
        <h1 className="langkah-judul" id="daftar-judul">
          Reservasi kamu
        </h1>
      </section>

      {list.isLoading ? (
        <p className="notice notice--spaced" role="status">
          Memuat reservasi…
        </p>
      ) : signedOut ? (
        <div className="notice notice--spaced" role="status">
          <p>
            <b>Belum masuk.</b> Daftar ini menampilkan reservasi dari akun yang
            sudah masuk. Kalau kamu memesan sebagai tamu, buka tiketnya dari
            daftar <b>Tiket di perangkat ini</b> di bawah, atau dari tautan yang
            dikirim ke nomor HP-mu.
          </p>
        </div>
      ) : list.isError ? (
        <div className="notice notice--merah notice--spaced" role="alert">
          <p>{errorCopy(list.error.code).body}</p>
          <button
            type="button"
            className="notice-recovery"
            onClick={() => void list.refetch()}
            disabled={list.isFetching}
          >
            Coba lagi
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="notice notice--spaced" role="status">
          <p>
            <b>Belum ada reservasi.</b> Pilih outlet dan jenis sepeda untuk
            memulai tiket ambil pertamamu.
          </p>
          <Link className="notice-link-action" href="/">
            Lihat outlet →
          </Link>
        </div>
      ) : (
        <>
          <ul className="tiket-daftar tiket-daftar--besar">
            {rows.map((r) => (
              <ReservationRow key={r.id} r={r} />
            ))}
          </ul>
          {list.hasNextPage && (
            <button
              type="button"
              className="aksi"
              onClick={() => void list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
            >
              <span className="aksi-teks">
                <small>Riwayat lebih lama</small>
                <b>{list.isFetchingNextPage ? "Memuat…" : "Muat reservasi lain"}</b>
              </span>
              <span className="aksi-panah" aria-hidden="true">
                →
              </span>
            </button>
          )}
        </>
      )}

      {knownTickets.length > 0 && (
        <section className="langkah-badan" aria-labelledby="judul-tiket-perangkat">
          <h2 className="langkah-judul" id="judul-tiket-perangkat">
            Tiket di perangkat ini
          </h2>
          <p className="catatan" style={{ marginLeft: 0, marginRight: 0 }}>
            Reservasi tamu yang kuncinya tersimpan di perangkat ini.
          </p>
          <ul className="tiket-daftar">
            {knownTickets.map((id) => (
              <li key={id}>
                <Link className="kembali" href={`/reservasi/${id}`}>
                  Buka tiket {id.slice(0, 8)} →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link className="kembali" href="/">
        ← Poster KAYOOH
      </Link>
    </main>
  );
}
