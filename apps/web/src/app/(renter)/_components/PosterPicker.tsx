"use client";

/**
 * The poster's search block — waktu & jenis pickers and the boxed-ink action.
 * Both controls are real buttons (aria-pressed); the action is a link to
 * /outlets carrying the choices as query params, where the catalog filters
 * by category and shows the chosen window. Below the strip the specimen row
 * shows the chosen type's silhouette and its live figure, so the renter
 * judges the bike against real stock before pressing anything. No per-type
 * copy is invented: silhouette + name + count only (NEG-2, never bike ids).
 */
import Link from "next/link";
import { useState } from "react";
import type { OutletListItem } from "@repo/contracts";
import { BikeGlyph } from "./BikeGlyph";
import { BikeSpecimen } from "./BikeSpecimen";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  WAKTU_LABEL,
  WAKTU_ORDER,
  outletsWithType,
  typeTotals,
  type CategoryCode,
  type WaktuCode,
} from "./shared";

export function PosterPicker({
  dayMonth,
  outlets,
  loadFailed,
}: {
  dayMonth: string;
  /** Live catalog; null when the poster fetch failed (0 ≠ unknown). */
  outlets: OutletListItem[] | null;
  loadFailed: boolean;
}) {
  const [waktu, setWaktu] = useState<WaktuCode>("siang");
  const [kategori, setKategori] = useState<CategoryCode>("commuter");

  const live = outlets ?? [];
  const count = loadFailed ? null : typeTotals(live, kategori);
  const outletsHolding = outletsWithType(live, kategori).length;
  const openOutlets = live.filter((o) => o.isOpenNow).length;

  // Inline recovery: the ready type with the most stock, if any.
  const recovery =
    !loadFailed && count === 0
      ? CATEGORY_ORDER.filter((c) => c !== kategori)
          .map((c) => ({ c, units: typeTotals(live, c) }))
          .filter((entry) => entry.units > 0)
          .sort((a, b) => b.units - a.units)[0] ?? null
      : null;

  const recoveryProps = recovery
    ? {
        label: `Yang siap: ${CATEGORY_LABEL[recovery.c]} — ${recovery.units} unit`,
        onSelect: () => setKategori(recovery.c),
      }
    : null;

  return (
    <>
      <section className="cari" aria-label="Pilih waktu dan jenis sepeda">
        <h2 className="label" id="label-waktu">
          Pilih waktu
        </h2>
        <div
          className="baris baris--waktu"
          role="group"
          aria-labelledby="label-waktu"
        >
          {WAKTU_ORDER.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={waktu === w}
              onClick={() => setWaktu(w)}
            >
              {WAKTU_LABEL[w]}
            </button>
          ))}
        </div>

        <h2 className="label" id="label-jenis" style={{ marginTop: 17 }}>
          Jenis sepeda
        </h2>
        <div
          className="baris baris--jenis"
          role="group"
          aria-labelledby="label-jenis"
        >
          {CATEGORY_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={kategori === c}
              onClick={() => setKategori(c)}
            >
              <BikeGlyph category={c} className="baris-glif" />
              <span>{CATEGORY_LABEL[c]}</span>
            </button>
          ))}
        </div>

        {loadFailed ? (
          <p className="notice" role="status">
            Daftar sepeda belum bisa dimuat — angka siap tidak ditampilkan
            daripada dikarang.{" "}
            <a className="notice-link-action" href="/">
              Muat ulang
            </a>
          </p>
        ) : (
          <BikeSpecimen
            category={kategori}
            mode="poster"
            count={count}
            outletTotal={openOutlets}
            outletCount={outletsHolding}
            recovery={recoveryProps}
          />
        )}
      </section>

      <Link
        className="aksi"
        href={`/outlets?kategori=${kategori}&waktu=${waktu}`}
      >
        <span className="aksi-teks">
          <small>
            {CATEGORY_LABEL[kategori]} · {WAKTU_LABEL[waktu]} · {dayMonth}
          </small>
          <b>Lihat ketersediaan</b>
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
    </>
  );
}
