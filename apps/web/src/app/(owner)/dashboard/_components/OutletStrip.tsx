/**
 * Outlet name and total fleet size strip.
 */
export function OutletStrip({
  name,
  totalBikes,
}: {
  name: string;
  totalBikes: number;
}) {
  return (
    <div className="owner-strip">
      <span>{name}</span>
      <span className="sep">◆</span>
      <span className="unit">{totalBikes} UNIT</span>
    </div>
  );
}
