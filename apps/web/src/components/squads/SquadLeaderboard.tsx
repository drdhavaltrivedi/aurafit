'use client';

import { Trophy } from 'lucide-react';
import type { SquadLeaderboardEntry } from '@aurafit/shared';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AppIcon } from '@/components/ui/AppIcon';
import { formatNumber } from '@/lib/format';
import { cx } from '@/lib/cx';

interface Props {
  squads: SquadLeaderboardEntry[] | null;
  loading: boolean;
  error: string | null;
  mySquadId?: string | null;
  onRetry: () => void;
}

/** Public weekly squad leaderboard (no member details). */
export function SquadLeaderboard({ squads, loading, error, mySquadId, onRetry }: Props) {
  return (
    <Card as="section" aria-labelledby="squad-board-title" id="squad-leaderboard">
      <CardHeader
        titleId="squad-board-title"
        eyebrow={
          <span className="text-orange">
            <Trophy aria-hidden="true" className="icon-inline" /> This week
          </span>
        }
        title="Squad leaderboard"
        subtitle="Ranked by aura earned since Monday 00:00 UTC."
      />
      {error ? (
        <div className="stack-2">
          <p className="alert alert--error" role="alert">
            {error}
          </p>
          <div>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        </div>
      ) : loading && !squads ? (
        <p className="text-sm text-secondary" role="status">
          Loading leaderboard…
        </p>
      ) : !squads || squads.length === 0 ? (
        <p className="empty">No squads yet this week. Create one and claim the top spot.</p>
      ) : (
        <ol className="list-reset squad-board" aria-label="Top squads this week">
          {squads.map((s) => {
            const mine = s.id === mySquadId;
            return (
              <li key={s.id} className={cx('squad-board__row', mine && 'is-mine')}>
                <span className={cx('rank-medal', s.rank <= 3 && `rank-medal--${s.rank}`)} aria-label={`Rank ${s.rank}`}>
                  {s.rank}
                </span>
                <span className="squad-emblem squad-emblem--sm" aria-hidden="true">
                  <AppIcon name={s.icon} />
                </span>
                <div className="squad-board__main">
                  <span className="squad-board__name">
                    {s.name} <span className="squad-tag">[{s.tag}]</span>
                    {mine && <span className="badge badge--sm tone-accent">Your squad</span>}
                  </span>
                  <span className="squad-board__sub">
                    {s.memberCount}/{s.maxMembers} hunters
                  </span>
                </div>
                <span className="squad-board__aura">{formatNumber(s.weeklyAura)} aura</span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
