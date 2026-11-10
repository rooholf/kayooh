/**
 * Fleet breakdown rows: SIAP (green), TERSEWA (blue), SERVIS (red).
 *
 * Each row shows: label, horizontal proportional bar, count.
 * Matches grounded-poster-solidaritas.html mock design.
 */
interface StateConfig {
  label: string;
  color: string;
}

const STATE_CONFIGS: Record<string, StateConfig> = {
  available: { label: "SIAP", color: "var(--hijau)" },
  rented: { label: "TERSEWA", color: "var(--biru)" },
  maintenance: { label: "SERVIS", color: "var(--merah-hot)" },
  unavailable: { label: "OFFLINE", color: "var(--tinta)" },
};

export function FleetGrid({
  counts,
  totalBikes,
}: {
  counts: Record<string, number>;
  totalBikes: number;
}) {
  // Ordered display states matching mock
  const states = ["available", "rented", "maintenance"];

  return (
    <section
      id="armada-section"
      className="owner-fleet"
      aria-label="Status armada outlet"
    >
      <div className="owner-fleet-header">
        <span>Armada outlet</span>
        <span>Unit</span>
      </div>
      <div className="owner-fleet-rows">
        {states.map((st) => {
          const conf = STATE_CONFIGS[st] ?? {
            label: st.toUpperCase(),
            color: "var(--tinta)",
          };
          const count = counts[st] ?? 0;
          const pct = totalBikes > 0 ? (count / totalBikes) * 100 : 0;

          return (
            <div key={st} className="owner-fleet-row">
              <span className="owner-fleet-state">{conf.label}</span>
              <span className="owner-fleet-bar">
                <i
                  className="owner-fleet-bar-fill"
                  style={{ width: `${pct}%`, background: conf.color }}
                />
              </span>
              <span className="owner-fleet-count">{count}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
