'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Flag, Flame, Heart, Play, Timer } from 'lucide-react';
import { creatorProfilePath, type WorkoutDrop } from '@aurafit/shared';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ReportDialog } from '@/components/moderation/ReportDialog';
import { creatorApi } from '@/lib/creator/client';
import { formatCompact } from '@/lib/format';

interface WorkoutDropListProps {
  drops: WorkoutDrop[];
  canStart: boolean;
  onStart: (drop: WorkoutDrop) => void;
  /** 'server' links creator names to /c/[handle] and enables the Following filter. */
  mode?: 'demo' | 'server';
  /** Signed-in profile id: enables "Report" on other people's drops (server mode). */
  viewerId?: string;
}

type Filter = 'all' | 'following';

export const WorkoutDropList = memo(function WorkoutDropList({ drops, canStart, onStart, mode = 'demo', viewerId }: WorkoutDropListProps) {
  const server = mode === 'server';
  const [reporting, setReporting] = useState<WorkoutDrop | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [followed, setFollowed] = useState<Set<string> | null>(null);
  const [followError, setFollowError] = useState<string | null>(null);

  const loadFollowing = useCallback(async () => {
    setFollowError(null);
    const res = await creatorApi.following();
    if (res.ok) setFollowed(new Set(res.data.creators.map((c) => c.id)));
    else setFollowError(res.message);
  }, []);

  const choose = (f: Filter) => {
    setFilter(f);
    // Fetched on every switch so follows made on a creator page show up without a reload.
    if (f === 'following') void loadFollowing();
  };

  const visible = useMemo(
    () => (filter === 'following' ? (followed ? drops.filter((d) => followed.has(d.creatorId)) : []) : drops),
    [filter, followed, drops],
  );

  return (
    <Card as="section" aria-labelledby="drops-title">
      <CardHeader
        titleId="drops-title"
        title={
          <>
            <Flame aria-hidden="true" className="icon-inline text-orange" /> Trending workout drops
          </>
        }
        subtitle="Curated routines from top athletes."
        action={
          server ? (
            <div className="segmented" role="group" aria-label="Show drops from">
              <button type="button" className={filter === 'all' ? 'segmented__item is-active' : 'segmented__item'} aria-pressed={filter === 'all'} onClick={() => choose('all')}>
                All
              </button>
              <button type="button" className={filter === 'following' ? 'segmented__item is-active' : 'segmented__item'} aria-pressed={filter === 'following'} onClick={() => choose('following')}>
                Following
              </button>
            </div>
          ) : undefined
        }
      />
      {filter === 'following' && followError ? (
        <p className="empty" role="alert">
          {followError}
        </p>
      ) : filter === 'following' && followed === null ? (
        <p className="empty">Loading creators you follow…</p>
      ) : visible.length === 0 ? (
        <p className="empty">
          {filter === 'following'
            ? followed && followed.size > 0
              ? 'Creators you follow have no live drops right now.'
              : "You're not following any creators yet. Tap a creator's name to visit their page and follow them."
            : 'No drops yet. Check back soon.'}
        </p>
      ) : (
        <ul className="stack-3 list-reset">
          {visible.map((drop) => (
            <li key={drop.id} className="drop">
              <div className="drop__main">
                <div className="tag-row">
                  <Badge tone="pink" size="sm">
                    {drop.vibeTag}
                  </Badge>
                  <Badge tone="accent" size="sm">
                    {drop.auraMultiplier}× Aura boost
                  </Badge>
                </div>
                <h3 className="drop__title">{drop.title}</h3>
                <p className="drop__tagline">{drop.tagline}</p>
              </div>
              {canStart && (
                <Button
                  id={`start-workout-${drop.id}`}
                  className="drop__cta"
                  size="sm"
                  onClick={() => onStart(drop)}
                  leadingIcon={<Play />}
                  aria-label={`Start session: ${drop.title}`}
                >
                  Start
                </Button>
              )}
              <div className="drop__meta">
                {server && drop.creatorHandle ? (
                  <Link href={creatorProfilePath(drop.creatorHandle)} className="drop__creator drop__creator--link">
                    <Avatar src={drop.creatorAvatar} alt="" size={24} name={drop.creatorName} />
                    {drop.creatorName}
                    <span className="sr-only"> (creator page)</span>
                  </Link>
                ) : (
                  <span className="drop__creator">
                    <Avatar src={drop.creatorAvatar} alt="" size={24} name={drop.creatorName} />
                    {drop.creatorName}
                  </span>
                )}
                <span className="drop__facts">
                  <span>
                    <Timer aria-hidden="true" className="icon-inline" /> {drop.durationMinutes} min
                  </span>
                  <span>
                    <Flame aria-hidden="true" className="icon-inline" /> {drop.caloriesBurnEstimate} kcal
                  </span>
                  <span>
                    <Heart aria-hidden="true" className="icon-inline" /> {formatCompact(drop.likesCount)}
                    <span className="sr-only"> likes</span>
                  </span>
                  {server && viewerId && drop.creatorId !== viewerId && (
                    <button type="button" className="drop__report" onClick={() => setReporting(drop)} aria-label={`Report ${drop.title}`}>
                      <Flag aria-hidden="true" className="icon-inline" /> Report
                    </button>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {server && (
        <ReportDialog target={reporting && { type: 'DROP', id: reporting.id, label: reporting.title }} onClose={() => setReporting(null)} />
      )}
    </Card>
  );
});
