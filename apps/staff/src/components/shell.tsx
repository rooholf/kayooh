import { outletContext } from "../lib/boot";
import type { TabId } from "../lib/nav";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "antrean", label: "Antrean" },
  { id: "sepeda", label: "Sepeda" },
  { id: "periksa", label: "Periksa" },
  { id: "akun", label: "Akun" },
];

export function AppBar() {
  const { shift } = outletContext;
  return (
    <header className="flex h-[54px] flex-none items-center justify-between border-b-2 border-ink px-[14px]">
      <div className="font-sans text-[16px] font-bold leading-none">
        Kayooh
        <small className="mt-1 block font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-rule">
          Pindai Staf
        </small>
      </div>
      <div className="text-right text-[11px] font-medium leading-snug">
        <b className="block font-mono text-[12px] font-bold">{shift.name}</b>
        <span className="text-ink/75">
          {shift.start}–{shift.end} WIB
        </span>
      </div>
    </header>
  );
}

interface TabBarProps {
  active: TabId;
  onChange: (tab: TabId) => void;
  queueBadge: number;
}

export function TabBar({ active, onChange, queueBadge }: TabBarProps) {
  return (
    <nav
      aria-label="Bagian aplikasi"
      className="grid h-[68px] flex-none grid-cols-4 border-t-2 border-ink"
    >
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={() => onChange(tab.id)}
            className={`relative flex items-center justify-center gap-1.5 border-l border-line/60 font-sans text-[10px] tracking-[0.06em] first:border-l-0 ${
              selected ? "font-bold text-rule" : "font-medium text-ink/70"
            }`}
          >
            {selected && (
              <span aria-hidden className="absolute inset-x-[18%] top-0 h-[3px] bg-rule" />
            )}
            {tab.label}
            {tab.id === "antrean" && queueBadge > 0 && (
              <span className="font-mono text-[10px] font-bold text-signal">{queueBadge}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
