"use client";

import { useState } from "react";
import type { CreateReservationResponse } from "@repo/contracts";

export function PaymentHandoff({ result }: { result: CreateReservationResponse }) {
  const [opened, setOpened] = useState(false);
  const { paymentUrl, price } = result;

  function open() {
    if (paymentUrl) {
      window.open(paymentUrl, "_blank", "noopener,noreferrer");
      setOpened(true);
    }
  }

  return (
    <div className="rounded-lg border-2 border-slate-900 p-4">
      <h3 className="text-base font-bold">Pembayaran DP</h3>
      <p className="mt-2 text-sm text-slate-700">
        DP 50% sebesar{" "}
        <b className="tabular-nums">
          {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(price.dpIdr)}
        </b>{" "}
        wajib dibayar online untuk mengamankan booking. Sisa dibayar offline di konter.
      </p>
      {paymentUrl ? (
        <button
          type="button"
          onClick={open}
          className="mt-4 min-h-[44px] w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          {opened ? "Buka ulang halaman pembayaran" : "Bayar DP sekarang (mock gateway)"}
        </button>
      ) : (
        <p className="mt-4 text-sm text-slate-600">
          Tidak ada pembayaran online (DP 0). Reservasi langsung dikonfirmasi.
        </p>
      )}
      {result.guestToken && (
        <p className="mt-3 text-xs text-slate-500">
          Token tamu: <code className="break-all">{result.guestToken}</code>
        </p>
      )}
    </div>
  );
}
