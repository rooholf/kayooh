"use client";

/**
 * Dashboard bottom bar: summary of fleet state + "BUKA ARMADA" CTA.
 *
 * Matches grounded-poster-solidaritas.html mock design.
 */
export function OwnerFooter({
  counts,
  totalBikes,
  onBukaArmada,
}: {
  counts: Record<string, number>;
  totalBikes: number;
  onBukaArmada?: () => void;
}) {
  const ready = counts["available"] ?? 0;
  const rented = counts["rented"] ?? 0;
  const maintenance = counts["maintenance"] ?? 0;

  const handleClick = () => {
    if (onBukaArmada) {
      onBukaArmada();
      return;
    }
    const fleetEl = document.getElementById("armada-section");
    if (fleetEl) {
      fleetEl.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <footer className="owner-foot">
      <div className="owner-foot-summary">
        {totalBikes} unit · <b>{ready} siap</b> · {rented} tersewa ·{" "}
        {maintenance} servis
      </div>
      <button
        type="button"
        className="owner-foot-cta"
        onClick={handleClick}
      >
        BUKA ARMADA
      </button>
    </footer>
  );
}
