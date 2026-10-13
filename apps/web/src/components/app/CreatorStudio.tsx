import { useMemo } from 'react';
import { Crown, Heart, Play, Plus, Share2 } from 'lucide-react';
import type { UserProfile, WorkoutDrop } from '@aurafit/shared';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { formatCompact, formatNumber } from '@/lib/format';
import { SampleDataBadge } from './SampleDataBadge';

interface CreatorStudioProps {
  /** 'demo' shows the seeded sample analytics; 'server' shows only figures derived from real drops. */
  mode: 'demo' | 'server';
  user: UserProfile;
  drops: WorkoutDrop[];
  canPublish: boolean;
  canViewAnalytics: boolean;
  canStart: boolean;
  onCreate: () => void;
  onShare: (drop: WorkoutDrop) => void;
  onStart: (drop: WorkoutDrop) => void;
}

export function CreatorStudio({ mode, user, drops, canPublish, canViewAnalytics, canStart, onCreate, onShare, onStart }: CreatorStudioProps) {
  const myDrops = useMemo(() => drops.filter((d) => d.creatorId === user.id), [drops, user.id]);
  const totals = useMemo(
    () => myDrops.reduce((acc, d) => ({ completions: acc.completions + d.completionsCount, likes: acc.likes + d.likesCount }), { completions: 0, likes: 0 }),
    [myDrops],
  );

  return (
    <div className="stack-6">
      <Card as="section" variant="feature" aria-labelledby="studio-title">
        <div className="card-header">
          <div className="card-header__text">
            <Badge tone="pink" outline>
              <Crown aria-hidden="true" className="icon-inline" /> Creator Studio
            </Badge>
            <h2 id="studio-title" className="page-title">
              {user.username} <span className="text-secondary fw-600">{user.handle}</span>
            </h2>
            <p className="text-secondary text-sm">
              {mode === 'demo'
                ? 'Publish workout drops, set Aura multipliers and grow your subscriber squad.'
                : 'Publish workout drops, set Aura multipliers and see how Hunters respond.'}
            </p>
          </div>
          {canPublish && (
            <Button id="create-drop-modal-btn" onClick={onCreate} leadingIcon={<Plus />} aria-haspopup="dialog">
              New routine
            </Button>
          )}
        </div>

        {canViewAnalytics && mode === 'demo' && (
          <div className="stack-2">
            <SampleDataBadge />
            <StatGrid label="Creator analytics (sample data)">
              <StatTile label="Squad subscribers" value="320" hint="+18% this week" />
              <StatTile label="Monthly recurring (MRR)" value="$2,450" tone="blue" hint="$7.99 / squad pass" hintTone="blue" />
              <StatTile label="Routine completions" value={formatNumber(totals.completions)} tone="pink" hint={`${myDrops.length} published drops`} />
              <StatTile label="Total likes" value={formatCompact(totals.likes)} tone="accent" hint="Across your drops" hintTone="accent" />
            </StatGrid>
          </div>
        )}

        {canViewAnalytics && mode === 'server' && (
          <StatGrid label="Creator analytics">
            <StatTile label="Published drops" value={formatNumber(myDrops.length)} hint="Live for all Hunters" />
            <StatTile label="Routine completions" value={formatNumber(totals.completions)} tone="pink" hint="Across your drops" hintTone="pink" />
            <StatTile label="Total likes" value={formatCompact(totals.likes)} tone="accent" hint="Across your drops" hintTone="accent" />
            <StatTile label="Subscriptions" value="Coming soon" tone="blue" hint="Squad passes are not live yet" hintTone="blue" />
          </StatGrid>
        )}
      </Card>

      <Card as="section" aria-labelledby="published-title">
        <CardHeader titleId="published-title" title="Your published drops" subtitle="Manage, preview and share your routines." />
        {myDrops.length === 0 ? (
          <div className="empty">
            <p>You haven&apos;t published any drops yet.</p>
            {canPublish && (
              <Button variant="secondary" onClick={onCreate} leadingIcon={<Plus />}>
                Create your first drop
              </Button>
            )}
          </div>
        ) : (
          <ul className="stack-3 list-reset">
            {myDrops.map((drop) => (
              <li key={drop.id} className="row-item">
                <div className="row-item__main">
                  <div className="row-item__title-row">
                    <h3 className="row-item__title">{drop.title}</h3>
                    <Badge tone="pink" size="sm">
                      {drop.vibeTag}
                    </Badge>
                  </div>
                  <p className="text-xs text-secondary">
                    {drop.durationMinutes} min · {drop.exercises.length} moves · {drop.auraMultiplier}× Aura
                  </p>
                </div>
                <div className="row-item__side">
                  <div className="text-right">
                    <div className="text-sm fw-800 text-accent">{formatNumber(drop.completionsCount)} finishes</div>
                    <div className="text-xs text-muted">
                      <Heart aria-hidden="true" className="icon-inline" /> {formatCompact(drop.likesCount)} likes
                    </div>
                  </div>
                  <div className="btn-row">
                    {canStart && (
                      <Button variant="secondary" size="sm" onClick={() => onStart(drop)} leadingIcon={<Play />} aria-label={`Preview ${drop.title}`}>
                        Preview
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => onShare(drop)} leadingIcon={<Share2 />} aria-label={`Share ${drop.title}`}>
                      Share
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
