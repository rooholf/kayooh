import type { OutletListItem } from "@repo/contracts";
import {
  CATEGORY_ORDER,
  CATEGORY_SHORT,
  availabilityCount,
  formatDistanceKm,
  type CategoryCode,
} from "./shared";

export type OutletTicketProps = {
  outlet: OutletListItem;
  selectedCategory?: CategoryCode;
  /** Heading level under the page heading: h2 after /outlets h1, h3 under home h2. */
  headingLevel?: "h2" | "h3";
};

/**
 * Outlet row in the world's ruled vocabulary — ink rules, tabular counts,
 * no soft cards. NEG-2: only per-category COUNTS are rendered, never bike
 * ids or asset tags.
 */
export function OutletTicket({
  outlet,
  selectedCategory,
  headingLevel = "h3",
}: OutletTicketProps) {
  const NameHeading = headingLevel;
  return (
    <li>
      <article className="pos" aria-label={outlet.name}>
        <div className="pos-head">
          <div>
            <NameHeading className="pos-nama">{outlet.name}</NameHeading>
            <p className="pos-alamat">{outlet.address}</p>
            {outlet.distanceKm !== undefined && (
              <p className="pos-jarak">{formatDistanceKm(outlet.distanceKm)}</p>
            )}
          </div>
          <span
            className={`chip ${outlet.isOpenNow ? "chip--buka" : "chip--tutup"}`}
          >
            {outlet.isOpenNow ? "Buka" : "Tutup"}
          </span>
        </div>

        <dl className="hitung" aria-label="Ketersediaan per jenis">
          {CATEGORY_ORDER.map((category) => {
            const count = availabilityCount(outlet, category);
            const dipilih = selectedCategory === category;
            return (
              <div
                key={category}
                className={dipilih ? "dipilih" : undefined}
              >
                <dt>{CATEGORY_SHORT[category]}</dt>
                <dd className={count === 0 ? "nol" : undefined}>{count}</dd>
              </div>
            );
          })}
        </dl>
      </article>
    </li>
  );
}
