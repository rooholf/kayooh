"use client";

/**
 * AtRiskOffer — the FR-INV-04 renter choice surface on the claim ticket.
 *
 * Server flagged this `confirmed` reservation `atRisk` (a bike was damaged or
 * went missing). The renter must, before `reallocationDeadlineAt`:
 *   - accept an alternative outlet (POST …/reallocate → A-06: a new confirmed
 *     reservation with copied pricing, no new payment), or
 *   - decline (POST …/decline-reallocation → cancelled + full refund), or
 *   - answer nothing and let the sweeper do the same on the deadline.
 *
 * INV-1 holds here: the offer counts are computed by the server; this surface
 * only relays them. NEG-2 (counts only), NEG-4 (no coordinates). Session-only
 * routes → a guest reads an honest 401 line, never dead controls.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReservationResource } from "@repo/contracts";
import { useAlternatives } from "../_hooks/useAlternatives";
import { useReallocate, useDeclineReallocation } from "../_hooks/useReallocation";
import { formatIdr } from "../_lib/format";
import { errorCopy } from "../_lib/error-copy";

/** "1 jam 04 menit" — padded mechanical clock feel over 1 hour. */
function formatSisa(ms: number): string {
  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} jam ${String(minutes).padStart(2, "0")} menit`;
  const seconds = Math.ceil(ms / 1_000) % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} menit`;
}

export function AtRiskOffer({
  r,
  onStatusChange,
}: {
  r: ReservationResource;
  /** Parent refetch after decline (the reservation then flips to cancelled). */
  onStatusChange: () => void;
}) {
  const router = useRouter();
  const alternatives = useAlternatives(r.id, true);
  const accept = useReallocate(r.id);
  const decline = useDeclineReallocation(r.id);
  const [selected, setSelected] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  const deadline = r.reallocationDeadlineAt ?? null;
  const deadlineMs = deadline !== null ? new Date(deadline).getTime() : null;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (deadlineMs === null || declined) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, [deadlineMs, declined]);

  const expired = now !== null && deadlineMs !== null && now >= deadlineMs;

  function onAccept() {
    if (selected === null) return;
    accept.mutate(
      { targetOutletId: selected },
      {
        onSuccess: (response) => {
          // The offer moved: show the new confirmed ticket (A-06 — no new pay).
          void router.push(`/reservasi/${response.reservation.id}`);
        },
      },
    );
  }

  function onDecline() {
    decline.mutate(undefined, {
      onSuccess: () => {
        setDeclined(true);
        // Let the parent flip to the cancelled stamp with fresh fields.
        void onStatusChange();
      },
    });
  }

  /* --- post-decline: a settled state, printed plainly --------------------- */
  if (declined) {
    return (
      <div className="notice notice--risiko" role="status">
        <p>
          <b>Tawaran ditolak.</b> Reservasi dibatalkan, seluruh dana
          ({formatIdr(r.dpIdr)} yang dibayar) dikembalikan penuh. Pindah outlet
          atau buat reservasi baru dari katalog.
        </p>
        <button type="button" className="notice-recovery" onClick={onStatusChange}>
          Perbarui status
        </button>
      </div>
    );
  }

  /* --- the countdown line -------------------------------------------------- */
  const countdown =
    now === null || deadlineMs === null
      ? null
      : expired
        ? "Batas waktu lewat."
        : `Sisa waktu pilihan: ${formatSisa(deadlineMs - now)}.`;

  return (
    <div className="notice notice--risiko" role="status">
      <p>
        <b>Stok di outlet ini berisiko.</b>{" "}
        {expired
          ? "Reservasi akan dibatalkan oleh sistem dan seluruh dana dikembalikan penuh."
          : "Pilih outlet pengganti ada stoknya, atau tolak tawaran ini."}{" "}
        {countdown !== null && <span className="risiko-sisa">{countdown}</span>}
      </p>

      {alternatives.isLoading && <p>Memuat pilihan outlet…</p>}

      {alternatives.isError && (
        <p>
          <b>{errorCopy(alternatives.error.code).title}.</b>{" "}
          {alternatives.error.status === 401
            ? "Pilihan realokasi diproses di sesi akun yang memesan reservasi ini. "
            : errorCopy(alternatives.error.code).body}
          <button
            type="button"
            className="notice-recovery"
            onClick={() => void alternatives.refetch()}
          >
            Coba lagi
          </button>
        </p>
      )}

      {alternatives.data !== undefined &&
        !alternatives.isError &&
        alternatives.data.alternatives.length === 0 && (
          <p>
            Belum ada outlet lain dengan stok jam ini. Jika batas waktu lewat,
            reservasi dibatalkan dan seluruh dana dikembalikan penuh.
          </p>
        )}

      {alternatives.data !== undefined &&
        !alternatives.isError &&
        alternatives.data.alternatives.length > 0 && (
          <>
            <div className="risiko-opsi" role="group" aria-label="Outlet pengganti">
              {alternatives.data.alternatives.map((alt) => (
                <button
                  key={alt.outletId}
                  type="button"
                  aria-pressed={selected === alt.outletId}
                  onClick={() =>
                    setSelected(selected === alt.outletId ? null : alt.outletId)
                  }
                >
                  <b>{alt.outletName}</b>
                  <span>{alt.availableNow} siap</span>
                </button>
              ))}
            </div>

            {accept.isError && (
              <p>
                {accept.error.code === "SOLD_OUT"
                  ? "Pilihan itu penuh saat diproses. Pilih outlet lain dari daftar."
                  : `${errorCopy(accept.error.code).title}. ${errorCopy(accept.error.code).body}`}
              </p>
            )}

            <div className="risiko-putusan">
              <button
                type="button"
                className="notice-recovery"
                onClick={onAccept}
                disabled={expired || selected === null || accept.isPending}
              >
                {accept.isPending ? "Memindahkan…" : "Pindahkan ke outlet ini"}
              </button>
              <button
                type="button"
                className="notice-recovery notice-recovery--tolak"
                onClick={onDecline}
                disabled={expired || decline.isPending}
              >
                {decline.isPending ? "Memproses…" : "Tolak — kembalikan dana penuh"}
              </button>
            </div>
          </>
        )}
    </div>
  );
}
