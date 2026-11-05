/**
 * BikeSpecimen — the drawn bicycle next to its live figure.
 *
 * One ruled unit: 3 px ink keyline on kertas ground, a monoline glyph
 * (~96 px box), the type name in Archivo Black, and a tabular figure whose
 * line is polite-announced so switching type reads the new count aloud.
 * Zero counts render in Nol — visible, quiet, honest. Never invents a
 * number: when the fetch failed (count === null) it renders nothing.
 *
 * mode "poster": one row for the chosen type, plus an inline recovery switch
 * when nothing is ready. mode "detail": four rows, one per type, selectable
 * (aria-pressed) so ?jenis= follows the choice.
 */
"use client";

import type { CategoryCode } from "./shared";
import { BikeGlyph } from "./BikeGlyph";
import { CATEGORY_LABEL } from "./shared";

export type BikeSpecimenProps = {
  category: CategoryCode;
  mode: "poster" | "detail";
  /** Live count from the server; null means the fetch failed — render nothing. */
  count: number | null;
  /** Poster mode only: outlets open today. */
  outletTotal?: number;
  /** Poster mode only: outlets holding this type. */
  outletCount?: number;
  /** Poster mode only: inline recovery switch when the chosen type has zero stock. */
  recovery?: { label: string; onSelect: () => void } | null;
  /** Detail mode only: whether this row is the selected type. */
  selected?: boolean;
  /** Detail mode only: select this type (writes ?jenis=). */
  onSelect?: (category: CategoryCode) => void;
};

export function BikeSpecimen({
  category,
  mode,
  count,
  outletTotal,
  outletCount,
  recovery,
  selected = false,
  onSelect,
}: BikeSpecimenProps) {
  const isZero = count === 0;
  const isNull = count === null;
  const label = CATEGORY_LABEL[category];
  const figure =
    isNull || isZero
      ? null
      : `${count} unit siap di ${outletCount ?? 0} outlet`;
  const keterangan =
    !isZero && outletTotal !== undefined
      ? `${outletTotal} outlet buka hari ini`
      : null;

  // The fetch failed: no number at all — the parent shows the dashed notice.
  if (isNull) return null;

  const handleSelect = () => {
    if (mode === "detail" && onSelect && !selected) onSelect(category);
  };

  const Root = mode === "detail" ? "li" : "div";

  return (
    <>
      <Root
        className={`spesimen ${
          mode === "detail" ? "spesimen--detail" : ""
        } ${isZero ? "spesimen--nol" : ""} ${selected
          ? "spesimen--pilih"
          : ""}`}
        aria-pressed={mode === "detail" ? selected : undefined}
        role={mode === "detail" ? "button" : undefined}
        tabIndex={mode === "detail" ? 0 : undefined}
        onClick={handleSelect}
        onKeyDown={(e) => {
          if (mode === "detail" && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            handleSelect();
          }
        }}
      >
        <div className="spesimen-glif">
          <BikeGlyph category={category} className="spesimen-glif-svg" />
        </div>
        <div className="spesimen-isi">
          <div className="spesimen-nama">{label}</div>
          {figure && (
            <div className="spesimen-angka" aria-live="polite">
              {figure}
            </div>
          )}
          {keterangan && <div className="spesimen-keterangan">{keterangan}</div>}
        </div>
      </Root>

      {mode === "poster" && isZero && recovery && (
        <div className="spesimen-switch">
          <button type="button" onClick={recovery.onSelect}>
            {recovery.label}
          </button>
        </div>
      )}
    </>
  );
}
