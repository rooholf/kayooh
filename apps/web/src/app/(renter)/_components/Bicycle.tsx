/**
 * Kayooh bicycle — one continuous cream line on the red emblem plate.
 * Drawn, not sourced; a single ink pass like a silkscreen.
 */
export function Bicycle({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "sepeda"}
      viewBox="0 0 200 116"
      role="img"
      aria-label="Sepeda kayuh"
    >
      <g
        fill="none"
        stroke="#F0E3C4"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="40" cy="82" r="28" />
        <circle cx="160" cy="82" r="28" />
        <path d="M40 82 L80 36 L120 36 L160 82" />
        <path d="M80 36 L98 82 L160 82" />
        <path d="M98 82 L66 82" />
        <path d="M120 36 L130 16 L152 16" />
        <path d="M80 36 L70 18 L52 18" />
      </g>
    </svg>
  );
}
