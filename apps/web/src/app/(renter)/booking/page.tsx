"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { isCategoryCode } from "../_components/shared";
import { useOutlets } from "./_hooks/useOutlets";
import { useCreateReservation } from "./_hooks/useCreateReservation";
import { QuantityStepper } from "./_components/QuantityStepper";
import { PriceSummary } from "./_components/PriceSummary";
import { PaymentHandoff } from "./_components/PaymentHandoff";

const CATEGORIES = ["commuter", "road", "mtb", "fixie"] as const;

function toIsoLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function BookingFormInner() {
  const searchParams = useSearchParams();
  const outlets = useOutlets();
  const create = useCreateReservation();

  const initialOutlet = searchParams.get("outlet") ?? "";
  const initialCategory = isCategoryCode(searchParams.get("category"))
    ? (searchParams.get("category") as string)
    : "commuter";

  const [outletId, setOutletId] = useState(initialOutlet);
  const [category, setCategory] = useState(initialCategory);
  const [quantity, setQuantity] = useState(1);
  const [phone, setPhone] = useState("");
  const [startsAt, setStartsAt] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return toIsoLocal(d);
  });
  const [endsAt, setEndsAt] = useState(() => {
    const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return toIsoLocal(d);
  });

  const outlet = useMemo(
    () => outlets.data?.outlets.find((o) => o.id === outletId) ?? null,
    [outlets.data, outletId],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      outletId,
      category,
      quantity,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      contactPhone: phone.trim() || undefined,
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full min-w-[360px] max-w-md flex-col bg-white px-4 py-6 text-slate-900">
      <h1 className="text-2xl font-bold tracking-tight">Pesan sepeda</h1>
      <p className="mt-1 text-sm text-slate-600">
        Guest checkout — hanya nomor HP. Tanpa verifikasi ID, tanpa deposit.
      </p>

      {create.isSuccess && create.data ? (
        <div className="mt-6 space-y-4">
          <PriceSummary result={create.data} />
          <PaymentHandoff result={create.data} />
          <Link href="/outlets" className="block text-center text-sm font-semibold text-slate-700 underline">
            Kembali ke katalog
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold">Nomor HP (kontak)</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+6281234567890"
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold">Outlet</span>
            <select
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="">Pilih outlet</option>
              {(outlets.data?.outlets ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} {o.isOpenNow ? "(Buka)" : "(Tutup)"}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold">Jenis sepeda</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="text-sm font-semibold">Jumlah sepeda</span>
            <div className="mt-1">
              <QuantityStepper value={quantity} onChange={setQuantity} />
            </div>
            {outlet && (
              <p className="mt-1 text-xs text-slate-600">
                Tersedia: {outlet.availability[category] ?? 0} {category}
              </p>
            )}
          </div>

          <label className="block">
            <span className="text-sm font-semibold">Mulai</span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold">Selesai</span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>

          {create.isError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {create.error instanceof Error ? create.error.message : "Gagal membuat reservasi."}
            </p>
          )}

          <button
            type="submit"
            disabled={create.isPending || !outletId}
            className="min-h-[44px] w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {create.isPending ? "Memproses…" : "Buat reservasi (bayar DP 50%)"}
          </button>
        </form>
      )}

      <p className="mt-6 text-xs text-slate-500">
        <Link href="/outlets" className="underline">Kembali ke katalog</Link>
      </p>
    </main>
  );
}

export default function BookingPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-slate-600">Memuat formulir…</p>}>
      <BookingFormInner />
    </Suspense>
  );
}
