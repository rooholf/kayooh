"use client";

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 5,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-11 w-11 items-center justify-center border-2 border-slate-900 bg-white text-lg font-bold disabled:opacity-40"
        aria-label="Kurangi jumlah"
      >
        −
      </button>
      <span className="min-w-[3ch] text-center text-lg font-bold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-11 w-11 items-center justify-center border-2 border-slate-900 bg-white text-lg font-bold disabled:opacity-40"
        aria-label="Tambah jumlah"
      >
        +
      </button>
    </div>
  );
}
