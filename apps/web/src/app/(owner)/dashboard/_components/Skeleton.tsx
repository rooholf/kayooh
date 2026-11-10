/** Loading skeleton placeholders. */
export function DashboardSkeleton() {
  return (
    <div style={{ padding: "14px 22px" }}>
      <div
        className="owner-skeleton"
        style={{ height: 28, width: "100%", marginBottom: 14 }}
      />
      <div
        className="owner-skeleton"
        style={{ height: 110, width: "100%", marginBottom: 20 }}
      />
      <div
        className="owner-skeleton"
        style={{ height: 20, width: "60%", marginBottom: 10 }}
      />
      <div
        className="owner-skeleton"
        style={{ height: 32, width: "100%", marginBottom: 8 }}
      />
      <div
        className="owner-skeleton"
        style={{ height: 32, width: "100%", marginBottom: 8 }}
      />
      <div
        className="owner-skeleton"
        style={{ height: 32, width: "100%" }}
      />
    </div>
  );
}
