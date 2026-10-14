import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Flame, Trophy, Zap } from 'lucide-react';
import {
  buildRankCardData,
  handleSlug,
  normalizeShareHandle,
  publicProfilePath,
  rankCardImagePath,
  type RankCardData,
} from '@aurafit/shared';
import { PageShell } from '@/components/shell/PageShell';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar, type ProgressTone } from '@/components/ui/ProgressBar';
import { getViewer } from '@/lib/auth/viewer';
import { getRepository } from '@/lib/data';
import '@/components/share/share.css';

export const dynamic = 'force-dynamic';

type Params = Promise<{ handle: string }>;

const STAT_TONES: Record<RankCardData['stats'][number]['key'], ProgressTone> = { str: 'danger', agi: 'blue', end: 'emerald', rec: 'accent' };

function decodeParam(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/**
 * Public card fields for /u/<handle> (or /u/@handle). Deduplicated between generateMetadata and
 * the page. null for invalid handles, unknown profiles, or when the database is not configured.
 */
const loadCard = cache(async (rawHandle: string): Promise<RankCardData | null> => {
  const decoded = decodeParam(rawHandle);
  const handle = decoded === null ? null : normalizeShareHandle(decoded);
  if (!handle) return null;
  const repo = getRepository();
  if (!repo) return null;
  try {
    const profile = await repo.getPublicProfileByHandle(handle);
    return profile ? buildRankCardData(profile) : null;
  } catch (err) {
    console.error('[/u/[handle]]', err);
    return null;
  }
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const card = await loadCard((await params).handle);
  // Public profiles are shareable but not indexed: users did not opt in to search engines.
  const robots = { index: false, follow: true };
  if (!card) return { title: 'Hunter not found', robots };

  const title = `${card.displayName} (${card.handle}) · ${card.rankLabel} Hunter`;
  const description = `${card.rankLabel} hunter on AuraFit with ${card.auraLabel} aura and a ${card.streakLabel.toLowerCase()}. Turn workouts into quests and climb the ranks.`;
  const image = {
    url: rankCardImagePath(card.handle, 'square', card.auraPoints),
    width: 1080,
    height: 1080,
    alt: `${card.displayName}'s AuraFit hunter card: ${card.rankLabel}, ${card.auraLabel} aura`,
    type: 'image/png',
  };
  return {
    title,
    description,
    robots,
    alternates: { canonical: publicProfilePath(card.handle) },
    openGraph: {
      title,
      description,
      url: publicProfilePath(card.handle),
      siteName: 'AuraFit',
      type: 'profile',
      username: handleSlug(card.handle),
      images: [image],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

/** Public hunter card page: public leaderboard fields only, plus a "Join AuraFit" CTA. */
export default async function PublicHunterPage({ params }: { params: Params }) {
  const [card, viewer] = await Promise.all([loadCard((await params).handle), getViewer()]);
  if (!card) notFound();

  const sealStyle = { '--seal-from': card.theme.from, '--seal-to': card.theme.to } as CSSProperties;
  const isSelf = viewer?.handle === card.handle;

  return (
    <PageShell viewer={viewer}>
      <div className="container hunter-page">
        <section className="hunter-hero" aria-labelledby="hunter-name">
          <div className="hunter-hero__top">
            <div className="hunter-seal" style={sealStyle} aria-hidden="true">
              <span className={card.rank === 'MONARCH' ? 'hunter-seal__inner hunter-seal__inner--word' : 'hunter-seal__inner'}>{card.rankGlyph}</span>
            </div>
            <div className="hunter-hero__identity">
              <Badge tone="accent" outline>
                <Trophy aria-hidden="true" className="icon-inline" /> {card.rankLabel} Hunter · Level {card.level}
              </Badge>
              <h1 id="hunter-name" className="hunter-hero__name">
                {card.displayName}
              </h1>
              <p className="text-secondary">{card.handle}</p>
            </div>
          </div>

          <dl className="hunter-hero__facts">
            <div className="hunter-fact">
              <dt>Aura points</dt>
              <dd>
                <Zap aria-hidden="true" className="icon-inline text-accent" /> {card.auraLabel}
              </dd>
            </div>
            <div className="hunter-fact">
              <dt>Day streak</dt>
              <dd>
                <Flame aria-hidden="true" className="icon-inline text-orange" /> {card.streakDays}
              </dd>
            </div>
            <div className="hunter-fact">
              <dt>Workouts</dt>
              <dd>{card.totalWorkouts}</dd>
            </div>
          </dl>

          <div className="panel">
            <div className="row-between text-sm">
              <span id="hunter-progress-label" className="text-secondary">
                Rank progress
              </span>
              <span className="text-accent fw-700">{card.progressLabel}</span>
            </div>
            <ProgressBar value={card.progressPercent} labelledBy="hunter-progress-label" valueText={card.progressLabel} />
            <div className="row-between text-xs text-muted">
              <span>{card.rankLabel}</span>
              <span>{card.progressDetail}</span>
            </div>
          </div>

          <div>
            <h2 className="overline">Core RPG attributes</h2>
            <ul className="attr-grid list-reset">
              {card.stats.map((s) => (
                <li key={s.key} className="attr">
                  <div className="row-between text-sm">
                    <span className="text-secondary fw-600">
                      {s.label} <span className="attr__name">({s.name})</span>
                    </span>
                    <span className="fw-800">{s.value}</span>
                  </div>
                  <ProgressBar value={s.percent} label={`${s.name} ${s.value} of 100`} tone={STAT_TONES[s.key]} size="xs" />
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="card card--feature hunter-cta" aria-labelledby="hunter-cta-title">
          <h2 id="hunter-cta-title" className="hunter-cta__title">
            {isSelf ? 'This is your hunter card' : `Think you can out-rank ${card.displayName}?`}
          </h2>
          <p className="text-secondary">
            AuraFit turns quick home workouts into daily quests. Earn Aura, keep your streak and climb from E-Rank to Monarch.
          </p>
          <div className="btn-row">
            {viewer ? (
              <Link href="/arena" className="btn btn--primary btn--lg">
                Open your arena
              </Link>
            ) : (
              <>
                <Link href="/signup" className="btn btn--primary btn--lg">
                  Join AuraFit
                </Link>
                <Link href="/demo" className="btn btn--secondary btn--lg">
                  Try the demo
                </Link>
              </>
            )}
          </div>
        </section>

        <p className="hunter-page__note">
          Hunter cards show public leaderboard stats only (name, handle, rank, aura, attributes and streak). See our{' '}
          <Link href="/privacy#public-cards">privacy policy</Link>.
        </p>
      </div>
    </PageShell>
  );
}
