"use client";

/**
 * OutletPoster — the booking engine half of the link-in-bio landing (rev 1.3).
 *
 * One ruled row per offered category (zero-stock categories never render),
 * live counts patched in place by the SSE hook, and the only sanctioned
 * conversion action: BOOK NOW!! — straight into the pre-filled checkout
 * `/reservasi/baru?outlet=&jenis=` with the only required input left: the
 * phone. Prices come from the REAL server quote of the default window
 * computed at load ("Mulai …" — the checkout re-quotes everything); when a
 * quote is missing the row drops the figure instead of inventing one.
 * NEG-2: counts only; NEG-4: no coordinates ride any of this.
 */
import Link from "next/link";
import { useState } from "react";
import type { OutletListItem } from "@repo/contracts";
import { BikeGlyph } from "../../_components/BikeGlyph";
import { CATEGORY_WORD, CATEGORY_LABEL, type CategoryCode } from "../../_components/shared";
import { useOutletAvailability } from "../_hooks/useOutletAvailability";
import { formatIdr } from "../../reservasi/_lib/format";

export interface LandingQuote {
  priceIdr: number;
  dpIdr: number;
}

export function OutletPoster({
  initial,
  quotes,
}: {
  /** Server-rendered snapshot (outlet + availability); SSE keeps it fresh. */
  initial: OutletListItem;
  /** Per-category quote of the default window; null when the quote failed. */
  quotes: Record<string, LandingQuote | null>;
}) {
  const outlet = useOutletAvailability(initial);

  // Zero-stock categories were omitted server-side (FR-CAT-01.1); the row set
  // is fixed per visit while the figures inside stay live.
  const offered = Object.keys(initial.availability) as CategoryCode[];

  const [selected, setSelected] = useState<CategoryCode>(offered[0] ?? "commuter");
  const isOffered = offered.includes(selected);
  const chosen = isOffered ? selected : (offered[0] ?? null);

  const price = chosen !== null ? (quotes[chosen] ?? null) : null;
  // Inline recovery: the ready type with the most stock, if the chosen one has none.
  const count = chosen !== null ? (outlet.availability[chosen] ?? 0) : 0;
  const recovery = count === 0 ? bestRecovery(offered, outlet.availability) : null;
  const href =
    chosen !== null
      ? `/reservasi/baru?outlet=${outlet.id}&jenis=${chosen}`
      : null;

  return (
    <>
      <section className="cari" aria-label="Pilih jenis dan pesan langsung">
        <ul className="spesimen-daftar">
          {offered.map((category) => (
            <BookingRow
              key={category}
              category={category}
              count={outlet.availability[category] ?? 0}
              quote={quotes[category] ?? null}
              selected={chosen === category}
              onSelect={() => setSelected(category)}
            />
          ))}
        </ul>

        {recovery !== null && (
          <div className="spesimen-switch">
            <button type="button" onClick={() => setSelected(recovery.category)}>
              Yang siap: {CATEGORY_LABEL[recovery.category]} — {recovery.count} unit
            </button>
          </div>
        )}
      </section>

      {href !== null ? (
        <Link className="aksi" href={href}>
          <span className="aksi-teks">
            <small>
              {price !== null
                ? `Mulai ${formatIdr(price.priceIdr)} · DP 50% ${formatIdr(price.dpIdr)}`
                : "2 jam · 1 sepeda"}
            </small>
            <b>Book Now!!</b>
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
      ) : (
        <p className="notice" role="status">
          Outlet ini belum menawarkan jenis sepeda yang bisa dipesan.
        </p>
      )}
    </>
  );
}

/** One ruled booking row: drawn silhouette · live figure · "Mulai" price. */
function BookingRow({
  category,
  count,
  quote,
  selected,
  onSelect,
}: {
  category: CategoryCode;
  count: number;
  quote: LandingQuote | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const isZero = count === 0;
  const handleSelect = () => {
    if (!selected) onSelect();
  };
  return (
    <li
      className={`spesimen spesimen--detail ${isZero ? "spesimen--nol" : ""}`}
      aria-pressed={selected}
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      }}
    >
      <div className="spesimen-glif">
        <BikeGlyph category={category} className="spesimen-glif-svg" />
      </div>
      <div className="spesimen-isi">
        <div className="spesimen-nama">{CATEGORY_LABEL[category]}</div>
        <div className="spesimen-angka" aria-live="polite">
          {isZero ? "Nol" : count} unit siap sekarang
        </div>
        <div className="spesimen-keterangan">
          {quote !== null
            ? `${CATEGORY_WORD[category].toLowerCase()} · mulai ${formatIdr(quote.priceIdr)}`
            : `${CATEGORY_WORD[category].toLowerCase()}`}
        </div>
      </div>
    </li>
  );
}

function bestRecovery(
  offered: CategoryCode[],
  availability: Record<string, number>,
): { category: CategoryCode; count: number } | null {
  return (
    offered
      .map((c) => ({ category: c, count: availability[c] ?? 0 }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count)[0] ?? null
  );
}
