/**
 * Dashboard bottom bar: summary of fleet state.
 */
export function OwnerFooter({
  counts,
  totalBikes,
}: {
  counts: Record<string, number>;
  totalBikes: number;
}) {
  const ready = counts["available"] ?? 0;
  const rented = counts["rented"] ?? 0;
  const maintenance = counts["maintenance"] ?? 0;

  return (
    <footer className="owner-foot">
      <div className="owner-foot-summary">
        {totalBikes} unit · <b>{ready} siap</b> · {rented} tersewa ·{" "}
        {maintenance} servis
      </div>
    </footer>
  );
}
