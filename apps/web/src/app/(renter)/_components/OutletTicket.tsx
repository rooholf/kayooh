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
 *
 * One affordance only: the outlet name plus the visible action line ("Lihat
 * sepeda di outlet ini") form a single link to the detail page; the ruled
 * count grid stays outside the link, unchanged.
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
            <NameHeading className="pos-nama">
              <a className="pos-tautan" href={`/outlets/${outlet.id}`}>
                {outlet.name}
              </a>
            </NameHeading>
            <p className="pos-alamat">{outlet.address}</p>
            {outlet.distanceKm !== undefined && (
              <p className="pos-jarak">{formatDistanceKm(outlet.distanceKm)}</p>
            )}
            <a className="pos-aksi" href={`/outlets/${outlet.id}`}>
              Lihat sepeda di outlet ini
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path
                  d="M3 8 H13 M9 3 L14 8 L9 13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
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
