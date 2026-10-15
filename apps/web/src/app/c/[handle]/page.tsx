import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { BadgeCheck, Flame, Heart, Play, Timer, Trophy } from 'lucide-react';
import { CATEGORY_NAMES, DIFFICULTY_LABELS, creatorProfilePath, type CreatorProfileResponse } from '@aurafit/shared';
import { PageShell } from '@/components/shell/PageShell';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { FollowButton } from '@/components/creator/FollowButton';
import { getViewer } from '@/lib/auth/viewer';
import { getCreatorRepository } from '@/lib/creator';
import { handleFromParam } from '@/lib/creator/http';
import { loadCreatorProfile } from '@/lib/creator/profile';
import { getRepository } from '@/lib/data';
import { formatCompact, formatNumber } from '@/lib/format';
import '@/components/creator/creator.css';

export const dynamic = 'force-dynamic';

type Params = Promise<{ handle: string }>;

/** Public creator profile (deduplicated between metadata and page). null = 404. Never throws. */
const load = cache(async (raw: string): Promise<CreatorProfileResponse | null> => {
  const handle = handleFromParam(raw);
  const repo = getCreatorRepository();
  const game = getRepository();
  if (!handle || !repo || !game) return null;
  try {
    // Follow state is fetched client-side by FollowButton (the page itself is viewer-independent).
    return await loadCreatorProfile(repo, game, handle, null);
  } catch (err) {
    console.error('[/c/[handle]]', err);
    return null;
  }
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await load((await params).handle);
  const robots = { index: false, follow: true };
  if (!data) return { title: 'Creator not found', robots };
  const { creator } = data;
  const title = `${creator.username} (${creator.handle}) · AuraFit creator`;
  const description = `${formatNumber(creator.liveDropCount)} workout drops by ${creator.username} on AuraFit. Follow to see new drops first.`;
  return { title, description, robots, alternates: { canonical: creatorProfilePath(creator.handle) }, openGraph: { title, description, type: 'profile' } };
}

/** Public creator page: badge, follower count, totals and live drops, with a login-gated Follow button. */
export default async function CreatorPage({ params }: { params: Params }) {
  const [data, viewer] = await Promise.all([load((await params).handle), getViewer()]);
  if (!data) notFound();
  const { creator, drops } = data;
  const isSelf = viewer?.handle === creator.handle;

  return (
    <PageShell viewer={viewer}>
      <div className="container creator-page">
        <section className="card card--feature stack-6" aria-labelledby="creator-name">
          <div className="creator-hero">
            <div className="creator-hero__identity">
              <Avatar src={creator.avatarUrl} alt="" size={72} name={creator.username} />
              <div className="stack-2">
                <Badge tone={creator.official ? 'accent' : 'pink'} outline>
                  <BadgeCheck aria-hidden="true" className="icon-inline" /> {creator.badge}
                </Badge>
                <h1 id="creator-name" className="creator-hero__name">
                  {creator.username}
                </h1>
                <p className="text-secondary">
                  {creator.handle}
                  {creator.title ? ` · ${creator.title}` : ''}
                </p>
              </div>
            </div>
            <FollowButton handle={creator.handle} initialCount={creator.followerCount} signedIn={!!viewer} isSelf={isSelf} />
          </div>
          {creator.bio ? <p className="text-secondary">{creator.bio}</p> : null}
          <StatGrid label="Creator stats">
            <StatTile label="Followers" value={formatNumber(creator.followerCount)} hint="Hunters following" />
            <StatTile label="Live drops" value={formatNumber(creator.liveDropCount)} tone="blue" hint="Free to run" hintTone="blue" />
            <StatTile label="Completions" value={formatCompact(creator.totalCompletions)} tone="pink" hint="All time" hintTone="pink" />
            <StatTile label="Likes" value={formatCompact(creator.totalLikes)} tone="accent" hint="All time" hintTone="accent" />
          </StatGrid>
        </section>

        <section className="card stack-3" aria-labelledby="creator-drops-title">
          <h2 id="creator-drops-title" className="card-header__title">
            <Trophy aria-hidden="true" className="icon-inline text-orange" /> Workout drops
          </h2>
          {drops.length === 0 ? (
            <p className="empty">No live drops yet. Follow to see the first one in your Following feed.</p>
          ) : (
            <ul className="creator-drops list-reset">
              {drops.map((d) => (
                <li key={d.id} className="creator-drop">
                  <span className="creator-drop__cover" style={{ background: `linear-gradient(90deg, ${d.coverGradient[0]}, ${d.coverGradient[1]})` }} aria-hidden="true" />
                  <div className="tag-row">
                    <Badge tone="pink" size="sm">
                      {d.vibeTag}
                    </Badge>
                    <Badge tone="neutral" size="sm">
                      {CATEGORY_NAMES[d.category]} · {DIFFICULTY_LABELS[d.difficulty]}
                    </Badge>
                  </div>
                  <h3 className="drop__title">{d.title}</h3>
                  {d.tagline ? <p className="drop__tagline">{d.tagline}</p> : null}
                  <p className="drop__facts text-xs text-secondary">
                    <span>
                      <Timer aria-hidden="true" className="icon-inline" /> {d.durationMinutes} min
                    </span>
                    <span>
                      <Flame aria-hidden="true" className="icon-inline" /> {d.exercises.length} {d.exercises.length === 1 ? 'move' : 'moves'}
                    </span>
                    <span>{d.auraMultiplier}× Aura</span>
                    <span>
                      <Heart aria-hidden="true" className="icon-inline" /> {formatCompact(d.likesCount)}
                      <span className="sr-only"> likes</span>
                    </span>
                  </p>
                  <Link
                    href={viewer ? `/arena?start=${encodeURIComponent(d.id)}` : '/signup'}
                    className="btn btn--secondary btn--sm"
                    aria-label={`${viewer ? 'Start' : 'Sign up to start'}: ${d.title}`}
                  >
                    <Play aria-hidden="true" className="btn__icon" /> {viewer ? 'Start in arena' : 'Sign up to start'}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  );
}
