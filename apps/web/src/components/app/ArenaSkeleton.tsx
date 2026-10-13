export function ArenaSkeleton() {
  return (
    <div className="container arena" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your Arena…</span>
      <div className="skeleton skeleton--banner" />
      <div className="dashboard">
        <div className="dashboard__col">
          <div className="skeleton skeleton--card-lg" />
          <div className="skeleton skeleton--card-sm" />
        </div>
        <div className="dashboard__col">
          <div className="skeleton skeleton--card-lg" />
          <div className="skeleton skeleton--card-lg" />
        </div>
      </div>
    </div>
  );
}
