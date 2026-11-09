/**
 * Kayooh bicycle — the commuter with a front basket, drawn as a single
 * ink pass on the red emblem plate. Drawn, not sourced; a silkscreen print.
 */
export function Bicycle({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "sepeda"}
      viewBox="90 250 820 500"
      role="img"
      aria-label="Sepeda kayuh dengan keranjang depan"
    >
      <g
        stroke="#F0E3C4"
        fill="none"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Wheels */}
        <circle cx="260" cy="580" r="150" />
        <circle cx="740" cy="580" r="150" />
        {/* Chainring */}
        <circle cx="480" cy="580" r="40" />
        {/* Main frame */}
        <path d="M 260 580 L 400 360 L 652 360 L 480 580 L 400 360" />
        {/* Fork & stem */}
        <path d="M 630 305 L 740 580" />
        {/* Handlebar */}
        <path d="M 630 305 L 680 305 L 630 270 L 600 270" />
        {/* Seatpost */}
        <path d="M 400 360 L 385 320" />
        {/* Saddle */}
        <path d="M 350 325 C 370 310, 410 310, 425 325 C 410 335, 370 335, 350 325 Z" />
        {/* Crank & pedal */}
        <path d="M 480 580 L 480 670 M 450 670 L 510 670" />
        {/* Chain (upper and lower) */}
        <path d="M 260 580 L 480 540 M 260 580 L 480 620" />
        {/* Front rack base & struts */}
        <path d="M 665 420 L 880 420 M 740 580 L 740 420 M 740 580 L 850 420" />
        {/* Front bag/box */}
        <path d="M 740 420 L 830 420 L 830 510 L 740 510 Z" />
        {/* Basket perimeter */}
        <path d="M 690 350 L 870 350 L 850 420 L 710 420 Z" />
        {/* Basket grid */}
        <path
          d="M 697 373 L 863 373 M 704 396 L 856 396 M 710 350 L 725 420 M 730 350 L 741 420 M 750 350 L 757 420 M 770 350 L 772 420 M 790 350 L 788 420 M 810 350 L 804 420 M 830 350 L 819 420 M 850 350 L 835 420"
          strokeWidth="10"
        />
      </g>
    </svg>
  );
}
