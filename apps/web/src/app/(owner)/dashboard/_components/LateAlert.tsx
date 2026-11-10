/**
 * Red alert banner when any rental is overdue.
 */
export function LateAlert({ count }: { count: number }) {
  return (
    <div className="owner-late-alert" role="alert">
      <span>Unit lewat batas waktu</span>
      <span className="count">{count}</span>
    </div>
  );
}
