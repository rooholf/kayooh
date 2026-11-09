"use client";

/**
 * The "1 PILIH" controls — day, slot, duration, quantity.
 *
 * Everything is a WIB wall-clock choice; the page converts the picked pair to a
 * UTC instant (schedule.ts). Closed or past slots are shown, never hidden —
 * struck in Nol grey and disabled, so the day reads as one ruled block
 * (craft floor: honest states). Blue is reserved for the selected hour block
 * only (One Blue Rule).
 */
import { DURATION_PRESETS, durationLabel, MAX_DURATION_MINUTES, MIN_DURATION_MINUTES, SLOT_MINUTES } from "../_lib/config";
import type { DayOption } from "../_lib/schedule";
import { CATEGORY_LABEL, type CategoryCode } from "../../_components/shared";

export function CategoryRow({
  value,
  counts,
  onChange,
}: {
  /** The selected bike type. */
  value: CategoryCode;
  /** Live counts per category; null when the outlet is unknown. */
  counts: Record<string, number> | null;
  onChange: (category: CategoryCode) => void;
}) {
  return (
    <div className="jenis-grid" role="group" aria-label="Jenis sepeda">
      {(Object.keys(CATEGORY_LABEL) as CategoryCode[]).map((category) => {
        const count = counts?.[category];
        const disabled = count === undefined;
        return (
          <button
            key={category}
            type="button"
            aria-pressed={value === category}
            disabled={disabled}
            title={disabled ? "Outlet ini tidak menawarkan jenis ini" : undefined}
            onClick={() => onChange(category)}
          >
            {CATEGORY_LABEL[category]}
            {count !== undefined && <small>{count}</small>}
          </button>
        );
      })}
    </div>
  );
}

export function DayStrip({
  days,
  value,
  onChange,
}: {
  days: DayOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="hari-strip" role="group" aria-label="Hari pengambilan">
      {days.map((day) => (
        <button
          key={day.key}
          type="button"
          aria-pressed={value === day.key}
          onClick={() => onChange(day.key)}
        >
          {day.weekday}
          <b>{day.dayMonth}</b>
        </button>
      ))}
    </div>
  );
}

export function SlotGrid({
  slots,
  value,
  closed,
  onChange,
}: {
  /** Bookable start times ("HH:MM") for the chosen day. */
  slots: string[];
  /** The selected start time, or null. */
  value: string | null;
  /** Start times that fit the window but are already spent/closed — shown struck. */
  closed: Set<string>;
  onChange: (slot: string) => void;
}) {
  if (slots.length === 0) {
    return (
      <p className="notice">
        Tidak ada jam yang cukup untuk durasi ini di hari itu. Pilih hari lain
        atau durasi lebih pendek.
      </p>
    );
  }
  return (
    <div className="slot-grid" role="group" aria-label="Jam ambil">
      {slots.map((slot) => (
        <button
          key={slot}
          type="button"
          ref={(el) => {
            if (el !== null && value === slot) {
              el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
            }
          }}
          aria-pressed={value === slot}
          disabled={closed.has(slot)}
          onClick={() => onChange(slot)}
        >
          {slot.replace(":", ".")}
        </button>
      ))}
    </div>
  );
}

export function DurationRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  return (
    <div className="durasi">
      <div className="durasi-preset" role="group" aria-label="Durasi cepat">
        {DURATION_PRESETS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            aria-pressed={value === minutes}
            onClick={() => onChange(minutes)}
          >
            {durationLabel(minutes)}
          </button>
        ))}
      </div>
      <div className="durasi-halus">
        <button
          type="button"
          aria-label={`Kurangi ${SLOT_MINUTES} menit`}
          disabled={value <= MIN_DURATION_MINUTES}
          onClick={() => onChange(value - SLOT_MINUTES)}
        >
          −
        </button>
        <output>{durationLabel(value)}</output>
        <button
          type="button"
          aria-label={`Tambah ${SLOT_MINUTES} menit`}
          disabled={value >= MAX_DURATION_MINUTES}
          onClick={() => onChange(value + SLOT_MINUTES)}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function QuantityRow({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (quantity: number) => void;
}) {
  return (
    <div className="jumlah">
      <button
        type="button"
        aria-label="Kurangi jumlah sepeda"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <output aria-live="polite">
        {value} sepeda
      </output>
      <button
        type="button"
        aria-label="Tambah jumlah sepeda"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}
