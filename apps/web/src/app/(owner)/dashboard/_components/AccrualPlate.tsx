/**
 * Big red accrual plate — gross earnings this WIB week.
 *
 * Money is strictly integer rupiah from the backend.
 * Label shows "Saldo Berjalan" with honest gross period annotation.
 */
import type { PeriodTab } from "./PeriodTabs";

export function AccrualPlate({
  grossIdr,
  period = "PEKAN",
}: {
  grossIdr: string;
  period?: PeriodTab;
}) {
  const amount = Number(grossIdr);
  const formatted = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

  const subLabel =
    period === "HARI"
      ? "Sebelum potongan komisi · Akrual hari ini WIB"
      : period === "BULAN"
      ? "Sebelum potongan komisi · Akrual bulan ini WIB"
      : "Sebelum potongan komisi · Senin–Minggu WIB";

  return (
    <section className="owner-plate" aria-label="Akrual pendapatan pekan ini">
      <div className="owner-plate-cols">
        <div className="owner-plate-text">
          <div className="owner-plate-label">
            Saldo Berjalan · Pendapatan Kotor Pekan Ini
          </div>
          <div className="owner-plate-amount">{formatted}</div>
          <div className="owner-plate-sub">{subLabel}</div>
        </div>
        <div className="owner-plate-chip">
          {/* authored banknote glyph — ink chip on the poster plate */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect width="18" height="12" x="3" y="6" rx="1.5" />
            <circle cx="12" cy="12" r="2.5" />
            <path d="M6.5 12h.01" />
            <path d="M17.5 12h.01" />
          </svg>
        </div>
      </div>
    </section>
  );
}
