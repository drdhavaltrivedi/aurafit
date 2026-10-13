import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Viewer } from '@/lib/auth/viewer';
import { AccountMenu } from './AccountMenu';
import { BrandLink } from './BrandLink';
import { SiteFooter } from './SiteFooter';

/**
 * Chrome for simple server-rendered pages (account, legal): brand header with
 * the account menu (or Log in / demo links), main landmark and the site footer.
 */
export function PageShell({ viewer, children }: { viewer: Viewer | null; children: ReactNode }) {
  return (
    <>
      <header className="site-header">
        <div className="container site-header__inner">
          <BrandLink />
          {viewer ? (
            <AccountMenu viewer={viewer} />
          ) : (
            <div className="btn-row">
              <Link href="/demo" className="btn btn--ghost btn--md">
                Try demo
              </Link>
              <Link href="/login" className="btn btn--secondary btn--md">
                Log in
              </Link>
            </div>
          )}
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="site-main">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
