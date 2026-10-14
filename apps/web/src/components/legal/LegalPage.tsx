import type { ReactNode } from 'react';
import { PageShell } from '@/components/shell/PageShell';
import type { Viewer } from '@/lib/auth/viewer';

export const LEGAL_LAST_UPDATED = 'October 14, 2026';

/** Long-form legal document layout: readable measure, table of contents, prose typography. */
export function LegalPage({
  viewer,
  eyebrow,
  title,
  intro,
  toc,
  children,
}: {
  viewer: Viewer | null;
  eyebrow: string;
  title: string;
  intro: ReactNode;
  toc: ReadonlyArray<{ id: string; label: string }>;
  children: ReactNode;
}) {
  return (
    <PageShell viewer={viewer}>
      <article className="container legal" aria-labelledby="legal-title">
        <header className="legal__header">
          <p className="eyebrow text-accent">{eyebrow}</p>
          <h1 id="legal-title" className="legal__title">
            {title}
          </h1>
          <p className="legal__meta">Last updated {LEGAL_LAST_UPDATED}</p>
          <div className="legal__intro">{intro}</div>
        </header>
        <nav className="legal__toc" aria-label="On this page">
          <p className="legal__toc-title">On this page</p>
          <ol>
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`}>{t.label}</a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="prose">{children}</div>
      </article>
    </PageShell>
  );
}

/** Section with an anchor id matching the table of contents. */
export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      {children}
    </section>
  );
}
