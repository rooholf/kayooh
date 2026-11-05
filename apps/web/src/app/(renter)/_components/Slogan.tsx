/**
 * The repeating slogan border — the poster's set frame.
 * Drifts slowly (one authored motion moment); disabled under
 * prefers-reduced-motion. Decorative: the promise is also set in real text
 * elsewhere on the page.
 */
export function Slogan({
  text,
  variant,
}: {
  text: string;
  variant: "red" | "yellow";
}) {
  const segment = `${text} ◆ `;
  const half = segment.repeat(6);
  return (
    <div
      aria-hidden="true"
      className={`slogan ${variant === "red" ? "slogan--red" : "slogan--yellow"}`}
    >
      <div className="slogan-track">
        <span>{half}</span>
        <span>{half}</span>
      </div>
    </div>
  );
}
