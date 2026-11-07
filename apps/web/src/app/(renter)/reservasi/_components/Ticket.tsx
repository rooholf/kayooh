"use client";

/**
 * The printed ticket pieces of the reservation sheet — "Tiket Ambil".
 *
 * Poster Solidaritas extends into a claim-ticket sequence here: four numbered
 * stamp plates that ink in as steps complete, a ruled invoice with a painted
 * total, the hold as a stamped square clock, and a status stamp that names the
 * rule producing it. No rounded corners, no shadows, flat fields and 3 px ink
 * rules. Every figure is printed from a server response. Money is integer
 * rupiah (INV-5); nothing here does float arithmetic.
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { ReservationStatus } from "@repo/contracts";
import { balanceIdr, formatIdr, statusStamp } from "../_lib/format";

const STEPS = [
  { n: 1, label: "Pilih" },
  { n: 2, label: "Data" },
  { n: 3, label: "Bayar" },
  { n: 4, label: "QR" },
] as const;

/** 1 PILIH · 2 DATA · 3 BAYAR · 4 QR — done plates ink in, the current one commits. */
export function StepStamps({ current }: { current: number }) {
  return (
    <ol className="langkah-strip" aria-label="Tahap reservasi">
      {STEPS.map((s) => {
        const state = s.n < current ? "done" : s.n === current ? "now" : "todo";
        return (
          <li
            key={s.n}
            className="langkah"
            data-state={state}
            aria-current={state === "now" ? "step" : undefined}
          >
            <b>{s.n}</b>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The ruled invoice (step 3 BAYAR).
 *
 * The quote is priced per unit (FR-PRC-01.2), so the caption states the basis
 * and the quantity; the money lines print the returned per-unit integers
 * verbatim — never multiplied, never invented. `dpIdr` is the online 50% DP and
 * `finalIdr - dpIdr` is the offline balance staff collect at check-out
 * (FR-INV-02.4, FR-RNT-01).
 */
export function Invoice({
  priceIdr,
  discountIdr,
  finalIdr,
  dpIdr,
  quantity,
}: {
  priceIdr: number;
  discountIdr: number;
  finalIdr: number;
  dpIdr: number;
  quantity: number;
}) {
  const sisaIdr = balanceIdr(finalIdr, dpIdr);
  return (
    <>
      <p className="nota-basis">
        Harga per sepeda · <b>{quantity}</b> sepeda
      </p>
      <dl className="nota">
        <div className="nota-baris">
          <dt>Sewa</dt>
          <dd>{formatIdr(priceIdr)}</dd>
        </div>
        {discountIdr > 0 && (
          <div className="nota-baris nota-baris--diskon">
            <dt>Diskon</dt>
            <dd>−{formatIdr(discountIdr)}</dd>
          </div>
        )}
        <div className="nota-total">
          <dt>Total</dt>
          <dd>{formatIdr(finalIdr)}</dd>
        </div>
      </dl>
      <dl className="nota">
        <div className="nota-baris nota-baris--dp">
          <dt>DP online (50%)</dt>
          <dd>{formatIdr(dpIdr)}</dd>
        </div>
        <div className="nota-baris">
          <dt>Sisa di outlet</dt>
          <dd>{formatIdr(sisaIdr)}</dd>
        </div>
      </dl>
    </>
  );
}

function secondsLeft(expiresAt: string): number {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

/**
 * The hold clock — the memorable moment. A stamped square figure in tabular
 * digits counting the 15-minute payment window down; at zero it is struck
 * through with one ink rule and the window is spent. Polite text only, never a
 * per-second live announcement (craft floor: motion and states).
 */
export function HoldClock({ expiresAt }: { expiresAt: string }) {
  const [secs, setSecs] = useState(() => secondsLeft(expiresAt));
  useEffect(() => {
    setSecs(secondsLeft(expiresAt));
    const timer = window.setInterval(() => setSecs(secondsLeft(expiresAt)), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const spent = secs <= 0;
  const minutes = Math.floor(secs / 60);
  const seconds = secs % 60;
  const figure = spent ? "0:00" : `${minutes}:${String(seconds).padStart(2, "0")}`;

  return (
    <p
      className={`jam-tahan${spent ? " jam-tahan--habis" : ""}`}
      role="timer"
      aria-label="Sisa waktu pembayaran DP"
    >
      <b>{figure}</b>
      <span>{spent ? "Waktu bayar habis" : "menit untuk bayar DP"}</span>
    </p>
  );
}

/** The status stamp and the one sentence stating the rule that produces it. */
export function StatusPlate({ status }: { status: ReservationStatus }) {
  const stamp = statusStamp(status);
  return (
    <section className="status-papan" aria-labelledby="status-judul">
      <h1 className="langkah-judul" id="status-judul">
        Tiket kamu
      </h1>
      <p className={`status-cap status-cap--${stamp.tone}`}>{stamp.label}</p>
      <p className="status-aturan">{stamp.rule}</p>
    </section>
  );
}

/** The perforated rule between ticket stubs (a dashed line, never a card). */
export function TearRule() {
  return <div className="robek" aria-hidden="true" />;
}

/**
 * The voucher's seal — the QR the staff scan at the counter (FR-SEC-01.1).
 *
 * Rendered client-side from the short-lived token: `qrcode` draws it into an
 * inline SVG in the sheet's ink-on-paper pair (never a raster). While it renders
 * — or if it fails — we say so rather than show an empty frame.
 */
export function QrCode({ token, label = "Kode QR tiket" }: { token: string; label?: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toString(token, {
      type: "svg",
      margin: 1,
      width: 240,
      errorCorrectionLevel: "M",
      color: { dark: "#171009", light: "#f0e3c4" },
    })
      .then((out) => {
        if (alive) setSvg(out);
      })
      .catch(() => {
        if (alive) setSvg(null);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  if (svg === null) {
    return (
      <p className="qr-tunggu" role="status">
        Menyiapkan kode…
      </p>
    );
  }
  return (
    <div className="qr" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

/** Remaining validity of the current voucher — quiet text, refreshed each tick. */
function VoucherValid({ expiresAt }: { expiresAt: string }) {
  const [secs, setSecs] = useState(() => secondsLeft(expiresAt));
  useEffect(() => {
    setSecs(secondsLeft(expiresAt));
    const timer = window.setInterval(() => setSecs(secondsLeft(expiresAt)), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  return <>{secs > 0 ? `Kode diperbarui otomatis · berlaku ${secs} detik` : "Menyegarkan kode…"}</>;
}

/**
 * The perforated claim ticket bought at step 3 (4 QR). Prints outlet, jenis,
 * window, the amount paid (the online DP), and a display serial — then the QR
 * seal the renter shows to staff. No bike ids, no coordinates (NEG-2/NEG-4).
 */
export function VoucherTicket({
  outletName,
  outletAddress,
  categoryLabel,
  quantity,
  windowText,
  paidIdr,
  serial,
  token,
  expiresAt,
}: {
  outletName: string | null;
  outletAddress: string | null;
  categoryLabel: string;
  quantity: number;
  windowText: string;
  paidIdr: number;
  serial: string;
  token: string;
  expiresAt: string;
}) {
  return (
    <section className="langkah-badan" aria-labelledby="judul-qr">
      <h2 className="langkah-judul" id="judul-qr">
        4 · Tiket QR
      </h2>
      <div className="tiket-ambil">
        <p className="tiket-ambil-kepala">{outletName ?? "Kayooh"}</p>
        {outletAddress !== null && <p className="tiket-ambil-alamat">{outletAddress}</p>}

        <dl className="tiket-ambil-fakta">
          <div className="tiket-ambil-fakta-baris">
            <dt>Jenis</dt>
            <dd>{categoryLabel}</dd>
          </div>
          <div className="tiket-ambil-fakta-baris">
            <dt>Jumlah</dt>
            <dd>{quantity} sepeda</dd>
          </div>
          <div className="tiket-ambil-fakta-baris">
            <dt>Jendela</dt>
            <dd>{windowText}</dd>
          </div>
          <div className="tiket-ambil-fakta-baris">
            <dt>Dibayar</dt>
            <dd>{formatIdr(paidIdr)}</dd>
          </div>
          <div className="tiket-ambil-fakta-baris">
            <dt>Seri</dt>
            <dd>{serial}</dd>
          </div>
        </dl>

        <div className="tiket-ambil-robek" aria-hidden="true" />

        <QrCode token={token} />
        <p className="tiket-ambil-usia">
          <VoucherValid expiresAt={expiresAt} />
        </p>
        <p className="tiket-ambil-arah">
          Tunjukkan layar ini ke staf — staf memindai QR dan tag sepeda sebelum
          menyerahkannya.
        </p>
      </div>
    </section>
  );
}
