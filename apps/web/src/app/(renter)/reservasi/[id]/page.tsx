"use client";

/**
 * /reservasi/[id] — the claim ticket's status and QR voucher (A-18, FR-SEC-01).
 *
 * Access: a signed-in renter is authenticated by the session cookie the
 * same-origin proxy forwards; a guest by the reservation-scoped `guestToken`
 * kept on this device. Both reads (`GET /reservations/{id}` and
 * `…/{id}/voucher`) accept either, so a guest who booked signed-out still sees
 * the detail and the QR from the link sent to their phone.
 *
 * The page reports state only: the stamp, the hold clock while unpaid, the
 * printed invoice, and — once `confirmed` — the perforated QR ticket, refetched
 * every `ttl/2` seconds. An at-risk (FR-INV-04) flag adds the ONE sanctioned
 * renter choice (accept an alternative outlet, or decline for a full refund);
 * there is otherwise NO cancel, end, or relocate-rental control (NEG-3/NEG-8).
 * Counts only, no bike ids (NEG-2); no coordinates (NEG-4).
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { OutletListItem } from "@repo/contracts";
import { Slogan } from "../../_components/Slogan";
import { CATEGORY_LABEL, type CategoryCode } from "../../_components/shared";
import { formatIdr } from "../_lib/format";
import { wibDayMonth, wibWeekday, windowLabel } from "../_lib/schedule";
import { errorCopy } from "../_lib/error-copy";
import { getGuestToken } from "../_lib/guest-token-store";
import { getPaymentUrl } from "../_lib/handoff-store";
import { useOutlets } from "../_hooks/useOutlets";
import { useReservation } from "../_hooks/useReservation";
import { useVoucher } from "../_hooks/useVoucher";
import {
  AtRiskOffer,
} from "../_components/AtRiskOffer";
import {
  HoldClock,
  Invoice,
  StatusPlate,
  TearRule,
  VoucherTicket,
} from "../_components/Ticket";

/** The one line of "what happens next" for each state — no invented controls. */
const NEXT_RULE: Record<string, string> = {
  held: "Bayar DP sebelum hitungan habis. Setelah dibayar, status berpindah ke LUNAS dan tiket QR terbit.",
  confirmed: "Simpan tautan halaman ini. Di konter, staf memindai kode tiket untuk menyerahkan sepeda.",
  fulfilled: "Sepeda sudah kamu bawa. Kembalikan di outlet milik owner yang sama sebelum waktu selesai.",
  expired: "Waktu bayar habis dan stok dilepas. Buat reservasi baru dari katalog untuk mencoba lagi.",
  cancelled: "Pembayaran gagal di gateway. Buat reservasi baru dari katalog untuk mencoba lagi.",
  no_show: "Sewa dilepas sebagai no-show 1 jam setelah jam mulai. Buat reservasi baru untuk mencoba lagi.",
};

function ReservasiDetailInner() {
  const params = useParams();
  const id = Array.isArray(params.id) ? (params.id[0] ?? "") : ((params.id as string | null) ?? "");

  // `ready` gates the first fetch until the device store has been read on the
  // client (localStorage is unavailable during SSR).
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setGuestToken(getGuestToken(id));
    setPaymentUrl(getPaymentUrl(id));
    setReady(true);
  }, [id]);

  const reservation = useReservation(id, guestToken, ready);
  const outlets = useOutlets();
  const confirmable = reservation.data?.status === "confirmed";
  const voucher = useVoucher(id, guestToken, confirmable);

  const outlet: OutletListItem | null = useMemo(
    () =>
      reservation.data
        ? (outlets.data?.outlets.find((o) => o.id === reservation.data.outletId) ?? null)
        : null,
    [outlets.data, reservation.data],
  );

  const header = (
    <>
      <Slogan variant="red" text="TIKET AMBIL ◆ SEPEDA SIAP DI OUTLET NYATA" />
      <Slogan variant="yellow" text="A CLAIM TICKET ◆ FOR A REAL OUTLET" />
    </>
  );

  if (!ready || reservation.isLoading) {
    return (
      <main>
        {header}
        <p className="notice notice--spaced" role="status">
          Memuat tiket…
        </p>
      </main>
    );
  }

  if (reservation.isError || !reservation.data) {
    // 401 = neither a renter session nor a device token can open this ticket.
    const needsKey = reservation.error?.status === 401;
    const copy = errorCopy(reservation.error?.code);
    return (
      <main>
        {header}
        <section className="status-papan">
          <h1 className="langkah-judul">
            {needsKey ? "Tiket tidak terbuka" : "Tiket tidak ditemukan"}
          </h1>
          {needsKey ? (
            <p className="notice" role="status">
              <b>Perangkat ini tidak menyimpan kunci tiket.</b> Tiket tamu hanya
              terbuka dari tautan yang dikirim ke nomor HP-mu, atau setelah
              masuk ke akun pemilik nomor itu.
            </p>
          ) : (
            <div className="notice notice--merah" role="alert">
              <p>
                <b>{copy.title}.</b> {copy.body}
              </p>
              <button
                type="button"
                className="notice-recovery"
                onClick={() => void reservation.refetch()}
              >
                Coba lagi
              </button>
            </div>
          )}
          <Link className="kembali" href="/reservasi">
            ← Semua reservasi
          </Link>
        </section>
      </main>
    );
  }

  const r = reservation.data;
  const category = r.category as CategoryCode;
  const categoryLabel = CATEGORY_LABEL[category] ?? r.category.toUpperCase();
  const serial = r.id.slice(0, 8).toUpperCase();
  const windowText = `${wibWeekday(r.startsAt)} ${wibDayMonth(r.startsAt)} · ${windowLabel(
    r.startsAt,
    r.endsAt,
  )} WIB`;

  return (
    <main>
      {header}

      <div className="alat">
        <p className="alat-merek">TIKET #{serial}</p>
        <button
          type="button"
          className="muat-ulang"
          onClick={() => void reservation.refetch()}
          disabled={reservation.isFetching}
        >
          {reservation.isFetching ? "Memuat…" : "Perbarui status"}
        </button>
      </div>

      <StatusPlate status={r.status} />

      {r.status === "held" && r.expiresAt !== null && (
        <div style={{ margin: "0 clamp(14px,4.5vw,24px)" }}>
          <HoldClock expiresAt={r.expiresAt} />
        </div>
      )}

      <p className="ringkas">
        {categoryLabel} · {r.quantity} sepeda · {windowText}
      </p>

      {outlet !== null && (
        <p className="catatan">
          Ambil di <b>{outlet.name}</b> — {outlet.address}
        </p>
      )}

      {r.atRisk && r.status === "confirmed" ? (
        <AtRiskOffer r={r} onStatusChange={() => void reservation.refetch()} />
      ) : r.atRisk ? (
        <div className="notice notice--risiko" role="status">
          <p>
            <b>Stok untuk jam ini berisiko.</b> Server menandai reservasi ini
            karena sepeda rusak atau tidak ada saat pengecekan. Reservasi sudah
            keluar dari status aktif; dana dikembalikan penuh.
          </p>
        </div>
      ) : null}

      <TearRule />

      <section className="langkah-badan" aria-labelledby="judul-nota">
        <h2 className="langkah-judul" id="judul-nota">
          Nota
        </h2>
        <Invoice
          priceIdr={r.priceIdr}
          discountIdr={r.discountIdr}
          finalIdr={r.finalIdr}
          dpIdr={r.dpIdr}
          quantity={r.quantity}
        />
        <p className="catatan" style={{ marginLeft: 0, marginRight: 0 }}>
          Sisa di outlet dibayar tunai/QRIS saat pengambilan (FR-RNT-01).
        </p>
      </section>

      {r.status === "confirmed" && (
        <>
          <TearRule />
          {voucher.isError ? (
            <section className="langkah-badan" aria-labelledby="judul-qr">
              <h2 className="langkah-judul" id="judul-qr">
                4 · Tiket QR
              </h2>
              <div className="notice notice--merah" role="alert">
                <p>
                  {voucher.error.code === "STATE_CONFLICT"
                    ? "Tiket belum lunas, jadi QR belum terbit. Muat ulang status."
                    : errorCopy(voucher.error.code).body}
                </p>
                <button
                  type="button"
                  className="notice-recovery"
                  onClick={() => void voucher.refetch()}
                  disabled={voucher.isFetching}
                >
                  Muat ulang kode
                </button>
              </div>
            </section>
          ) : voucher.data ? (
            <VoucherTicket
              outletName={outlet?.name ?? null}
              outletAddress={outlet?.address ?? null}
              categoryLabel={categoryLabel}
              quantity={r.quantity}
              windowText={windowText}
              paidIdr={r.dpIdr}
              serial={serial}
              token={voucher.data.token}
              expiresAt={voucher.data.expiresAt}
            />
          ) : (
            <section className="langkah-badan" aria-labelledby="judul-qr">
              <h2 className="langkah-judul" id="judul-qr">
                4 · Tiket QR
              </h2>
              <p className="notice" role="status">
                Menerbitkan kode tiket…
              </p>
            </section>
          )}
        </>
      )}

      <TearRule />

      <section className="langkah-badan" aria-labelledby="judul-lanjut">
        <h2 className="langkah-judul" id="judul-lanjut">
          Selanjutnya
        </h2>
        <p className="catatan" style={{ marginLeft: 0, marginRight: 0 }}>
          {NEXT_RULE[r.status] ?? "Status belum punya aturan tampilan."}
        </p>

        {r.status === "held" && paymentUrl !== null && (
          <a className="aksi" href={paymentUrl}>
            <span className="aksi-teks">
              <small>DP online {formatIdr(r.dpIdr)}</small>
              <b>Lanjutkan pembayaran</b>
            </span>
            <span className="aksi-panah" aria-hidden="true">
              →
            </span>
          </a>
        )}

        {r.status === "held" && paymentUrl === null && (
          <p className="catatan" style={{ marginLeft: 0, marginRight: 0 }}>
            <b>Belum ada tautan pembayaran di perangkat ini.</b> Buka tautan
            pembayaran dari pesan yang dikirim ke nomor HP-mu, lalu kembali ke
            halaman ini.
          </p>
        )}
      </section>

      <Link className="kembali" href="/reservasi">
        ← Semua reservasi
      </Link>
    </main>
  );
}

export default function ReservasiDetailPage() {
  return <ReservasiDetailInner />;
}
