import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

/** Minimal chrome for auth pages: brand header + centred card. */
export function AuthShell({ title, lede, children, footer }: { title: string; lede?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <header className="site-header">
        <div className="container site-header__inner">
          <Link href="/" className="brand" aria-label="AuraFit home">
            <Image src="/logo.jpg" alt="" width={40} height={40} className="brand__logo" priority />
            <span className="brand__text">
              <span className="brand__name">AURAFIT</span>
              <span className="brand__tag">Solo Leveling RPG Fitness</span>
            </span>
          </Link>
          <Link href="/demo" className="btn btn--ghost btn--md">
            Try demo
          </Link>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="auth-page">
        <Card as="section" variant="feature" className="auth-card" aria-labelledby="auth-title">
          <div className="stack-2">
            <h1 id="auth-title" className="auth-card__title">
              {title}
            </h1>
            {lede && <p className="auth-card__lede">{lede}</p>}
          </div>
          {children}
          {footer && <div className="auth-card__footer">{footer}</div>}
        </Card>
      </main>
    </>
  );
}

/** Shown on every auth page when Supabase env vars are missing. */
export function AuthNotConfigured() {
  return (
    <div className="stack-3">
      <p className="alert alert--info" role="status">
        Accounts aren&apos;t configured on this server yet (missing Supabase environment variables). You can still explore every
        feature in demo mode — progress is saved in this browser only.
      </p>
      <Link href="/demo" className="btn btn--primary btn--lg btn--block">
        Try demo
      </Link>
    </div>
  );
}
