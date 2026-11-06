"use client";

import type { CreateReservationResponse } from "@repo/contracts";

function idr(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export function PriceSummary({ result }: { result: CreateReservationResponse }) {
  const { reservation, price } = result;
  const balance = price.finalIdr - price.dpIdr;
  return (
    <div className="rounded-lg border-2 border-slate-900 p-4">
      <h3 className="text-base font-bold">Ringkasan harga</h3>
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt>Harga sewa</dt>
          <dd className="tabular-nums">{idr(price.priceIdr)}</dd>
        </div>
        {price.discountIdr > 0 && (
          <div className="flex justify-between">
            <dt>Diskon</dt>
            <dd className="tabular-nums">−{idr(price.discountIdr)}</dd>
          </div>
        )}
        <div className="flex justify-between font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{idr(price.finalIdr)}</dd>
        </div>
        <div className="flex justify-between border-t border-slate-300 pt-2 font-bold text-red-700">
          <dt>DP 50% (online)</dt>
          <dd className="tabular-nums">{idr(price.dpIdr)}</dd>
        </div>
        <div className="flex justify-between text-slate-600">
          <dt>Sisa (offline di konter)</dt>
          <dd className="tabular-nums">{idr(balance)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-slate-600">
        {reservation.quantity} sepeda · {reservation.category} · status {reservation.status}
      </p>
    </div>
  );
}
