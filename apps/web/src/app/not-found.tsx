import Link from 'next/link';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main id="main-content" className="status-page">
      <div className="status-page__card">
        <p className="eyebrow text-accent">Error 404</p>
        <h1 className="status-page__title">This dungeon gate is closed</h1>
        <p className="text-secondary">The page you are looking for doesn&apos;t exist or has moved.</p>
        <Link href="/" className="btn btn--primary btn--lg">
          Back to AuraFit
        </Link>
      </div>
    </main>
  );
}
