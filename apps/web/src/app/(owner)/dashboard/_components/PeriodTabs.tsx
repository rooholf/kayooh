"use client";

/**
 * Period switch tabs: HARI / PEKAN / BULAN.
 *
 * Honest stub: only PEKAN (current WIB week) is backed by the P1 API
 * (`grossAccruedIdr`). HARI and BULAN are P2 surfaces (daily delta and
 * monthly roll-up) and are rendered disabled with a P2 hint rather than
 * fabricating figures.
 *
 * Matches grounded-poster-solidaritas.html mock design.
 */
export type PeriodTab = "HARI" | "PEKAN" | "BULAN";

const P2_TABS: ReadonlySet<PeriodTab> = new Set(["HARI", "BULAN"]);

export function PeriodTabs({
  activeTab,
  onChange,
}: {
  activeTab: PeriodTab;
  onChange: (tab: PeriodTab) => void;
}) {
  const tabs: PeriodTab[] = ["HARI", "PEKAN", "BULAN"];

  return (
    <div className="owner-tabs" role="tablist" aria-label="Pilihan periode">
      {tabs.map((tab) => {
        const isP2 = P2_TABS.has(tab);
        const isActive = !isP2 && activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={isP2}
            disabled={isP2}
            title={isP2 ? "Tersedia di P2 (laporan)" : undefined}
            className={`owner-tab ${isActive ? "on" : ""} ${isP2 ? "owner-tab--p2" : ""}`}
            onClick={() => {
              if (!isP2) onChange(tab);
            }}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
