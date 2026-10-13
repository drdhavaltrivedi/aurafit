'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface the error for monitoring; replace with a reporting service if available.
    console.error(error);
  }, [error]);

  return (
    <main id="main-content" className="status-page">
      <div className="status-page__card" role="alert">
        <p className="eyebrow text-danger">Something went wrong</p>
        <h1 className="status-page__title">A glitch in the System</h1>
        <p className="text-secondary">
          An unexpected error interrupted your session. Your saved progress is safe.
          {error.digest && <span className="block text-xs text-muted">Reference: {error.digest}</span>}
        </p>
        <div className="btn-row btn-row--center">
          <button type="button" className="btn btn--primary btn--lg" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/" className="btn btn--secondary btn--lg">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
