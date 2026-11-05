/**
 * BikeGlyph — the four category silhouettes.
 *
 * One continuous monoline stroke in `currentColor`, drawn at the emblem's
 * stroke ratio (~5% of the viewBox height) so a type reads at 64 px wide as
 * well as at specimen size. Outlines only — never filled, never an icon set.
 * Decorative by default (`aria-hidden`); the type name carries the meaning.
 */
import type { CategoryCode } from "./shared";

const VIEWBOX = "0 0 120 78";
const STROKE = "5.5";

function commonProps() {
  return {
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: STROKE,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: VIEWBOX,
  };
}

function Commuter() {
  return (
    <svg {...commonProps()} role="presentation" aria-hidden="true">
      <circle cx="28" cy="56" r="16" />
      <circle cx="94" cy="56" r="16" />
      <path d="M28 56 L48 22 L76 22 L94 56" />
      <path d="M48 22 L62 56 L94 56" />
      <path d="M76 22 L82 12 L98 12" />
      <path d="M48 22 L42 13 L30 13" />
    </svg>
  );
}

function Road() {
  return (
    <svg {...commonProps()} role="presentation" aria-hidden="true">
      <circle cx="28" cy="56" r="16" />
      <circle cx="94" cy="56" r="16" />
      <path d="M28 56 L52 24 L82 24 L94 56" />
      <path d="M52 24 L68 56 L94 56" />
      <path d="M68 56 L58 56" />
      <path d="M82 24 L88 14 L104 14" />
      <path d="M52 24 L46 14 L34 14" />
    </svg>
  );
}

function Mtb() {
  return (
    <svg {...commonProps()} role="presentation" aria-hidden="true">
      <circle cx="28" cy="56" r="16" />
      <circle cx="94" cy="56" r="16" />
      <path d="M28 56 L44 16 L70 16 L94 56" />
      <path d="M44 16 L58 56 L94 56" />
      <path d="M70 16 L76 8 L92 8" />
      <path d="M44 16 L38 8 L26 8" />
    </svg>
  );
}

function Fixie() {
  return (
    <svg {...commonProps()} role="presentation" aria-hidden="true">
      <circle cx="28" cy="56" r="16" />
      <circle cx="94" cy="56" r="16" />
      <path d="M28 56 L50 30 L78 26 L94 56" />
      <path d="M50 30 L66 56 L94 56" />
      <path d="M78 26 L84 16 L100 16" />
      <path d="M50 30 L44 20 L32 20" />
    </svg>
  );
}

const GLYPHS: Record<CategoryCode, React.FC> = {
  commuter: Commuter,
  road: Road,
  mtb: Mtb,
  fixie: Fixie,
};

/**
 * The drawn bike for one category at any size; the wrapper carries the
 * dimensions (`className`), the glyph inherits `currentColor`.
 */
export function BikeGlyph({
  category,
  className,
}: {
  category: CategoryCode;
  className?: string;
}) {
  const Glyph = GLYPHS[category];
  return (
    <span className={className} aria-hidden="true">
      <Glyph />
    </span>
  );
}
