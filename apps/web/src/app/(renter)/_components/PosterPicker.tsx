"use client";

/**
 * The poster's search block — waktu & jenis pickers and the boxed-ink action.
 * Both controls are real buttons (aria-pressed); the action is a link to
 * /outlets carrying the choices as query params, where the catalog filters
 * by category and shows the chosen window. No figure on this plate is
 * invented: the "siap" number arrives from the server fetch above.
 */
import Link from "next/link";
import { useState } from "react";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  WAKTU_LABEL,
  WAKTU_ORDER,
  type CategoryCode,
  type WaktuCode,
} from "./shared";

export function PosterPicker({ dayMonth }: { dayMonth: string }) {
  const [waktu, setWaktu] = useState<WaktuCode>("siang");
  const [kategori, setKategori] = useState<CategoryCode>("commuter");

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
          className="baris"
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
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
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
