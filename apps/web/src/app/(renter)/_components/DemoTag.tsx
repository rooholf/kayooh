/**
 * Env-gated demo-data marker.
 *
 * The launch database's seed fixtures are demo data, never launch figures.
 * Until a real stage is declared with NEXT_PUBLIC_DATA_STAGE=live, renter
 * pages mark the feed as DATA DEMO. No promises are made and no business rule
 * is inferred; this is a factual occupancy label.
 */
export function DemoTag() {
  if (process.env.NEXT_PUBLIC_DATA_STAGE === "live") return null;

  return (
    <p className="demo-tag">
      <span>Data demo</span> Jaringan fixture — bukan angka peluncuran.
    </p>
  );
}
