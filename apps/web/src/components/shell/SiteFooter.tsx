export function SiteFooter({ synced = false }: { synced?: boolean }) {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <p>
          <strong>AuraFit</strong> — level up your physical stats.
        </p>
        <p className="text-muted">{synced ? 'Progress is saved to your account.' : 'Demo data only. Progress is saved in this browser.'}</p>
      </div>
    </footer>
  );
}
