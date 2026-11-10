/**
 * Rhythm bands: "Ritme pendapatan pekan ini".
 *
 * Honest stub: per-day accrual history is a P2 surface (`GET /owner/reports/*`).
 * The P1 summary only returns the week's gross, so no bars are fabricated here;
 * the section keeps its place in the layout and states the P2 availability.
 *
 * Matches grounded-poster-solidaritas.html mock design (shape only).
 */
export function RhythmBands() {
  return (
    <section
      className="owner-bands"
      aria-label="Ritme pendapatan pekan ini"
    >
      <div className="owner-bands-title">Ritme pendapatan pekan ini</div>
      <div className="owner-bands-empty">
        Ritme harian tersedia di P2 (laporan).
      </div>
    </section>
  );
}
