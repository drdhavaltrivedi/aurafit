import Link from 'next/link';

export const CONTACT_EMAIL = 'digital@brilworks.com';

/** `status`: storage note for arena pages ('synced' = account, 'demo' = this browser). */
export function SiteFooter({ status }: { status?: 'synced' | 'demo' }) {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <p>
          <strong>AuraFit</strong> — level up your physical stats.
        </p>
        {status && (
          <p className="text-muted">{status === 'synced' ? 'Progress is saved to your account.' : 'Demo data only. Progress is saved in this browser.'}</p>
        )}
        <nav aria-label="Legal" className="site-footer__links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Support</Link>
          <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
        </nav>
      </div>
      <p className="container site-footer__disclaimer">
        AuraFit is for general fitness motivation, not medical advice. Check with a doctor before starting a new exercise routine.
      </p>
    </footer>
  );
}
