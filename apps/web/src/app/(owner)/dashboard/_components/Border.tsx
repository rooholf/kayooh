/** Top marching-text border strip — a duplicated half drives the CSS drift loop. */
function Half({ keyPrefix }: { keyPrefix: string }) {
  return Array.from({ length: 8 }, (_, i) => (
    <span key={`${keyPrefix}-${i}`}>
      <span>KAYOOH JAMBI</span>
      <span className="sep">◆</span>
      <span>PEMILIK</span>
      <span className="sep">◆</span>
    </span>
  ));
}

export function OwnerBorder() {
  return (
    <div className="owner-border" aria-hidden="true">
      <div className="owner-border-track">
        <Half keyPrefix="a" />
        <Half keyPrefix="b" />
      </div>
    </div>
  );
}
