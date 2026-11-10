/**
 * Big red accrual plate — gross earnings this WIB week.
 *
 * Money is strictly integer rupiah from the backend.
 * Label clearly says gross and week period (no fabricated daily delta).
 */
export function AccrualPlate({ grossIdr }: { grossIdr: string }) {
  const amount = Number(grossIdr);
  const formatted = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

  return (
    <section className="owner-plate" aria-label="Akrual pendapatan pekan ini">
      <div className="owner-plate-label">Pendapatan Kotor Pekan Ini</div>
      <div className="owner-plate-amount">{formatted}</div>
      <div className="owner-plate-sub">Sebelum potongan komisi · Senin–Minggu WIB</div>
    </section>
  );
}
