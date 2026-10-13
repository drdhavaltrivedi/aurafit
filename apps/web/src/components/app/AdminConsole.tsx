import { Shield, Trophy } from 'lucide-react';
import { INITIAL_GYM_LEADERBOARD } from '@aurafit/shared';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { formatNumber } from '@/lib/format';
import { cx } from '@/lib/cx';

export function AdminConsole({ canViewLeaderboard }: { canViewLeaderboard: boolean }) {
  return (
    <div className="stack-6">
      <Card as="section" variant="feature" aria-labelledby="admin-title">
        <Badge tone="emerald" outline>
          <Shield aria-hidden="true" className="icon-inline" /> Platform master access
        </Badge>
        <h2 id="admin-title" className="page-title">
          Global gym leaderboard &amp; anti-cheat
        </h2>
        <p className="text-secondary text-sm">Auditing 84 affiliated gym branches, anti-cheat streak verifications and economy health.</p>
        <StatGrid label="Platform metrics">
          <StatTile label="Total active Hunters" value={formatNumber(42850)} hint="Gen Z & Alpha" />
          <StatTile label="30-day streak retention" value="94.2%" tone="emerald" hint="3.4× industry benchmark" />
          <StatTile label="Aura economy health" value="Optimal" tone="blue" hint="0.02% drift rate" hintTone="blue" />
          <StatTile label="Affiliated gyms" value="84" tone="accent" hint="Tokyo, Seoul, LA" />
        </StatGrid>
      </Card>

      {canViewLeaderboard && (
        <Card as="section" aria-labelledby="leaderboard-title">
          <CardHeader
            titleId="leaderboard-title"
            title={
              <>
                <Trophy aria-hidden="true" className="icon-inline text-orange" /> Gym leaderboard
              </>
            }
            subtitle="Ranked by total Aura earned this season."
          />
          <ol className="stack-2 list-reset">
            {INITIAL_GYM_LEADERBOARD.map((gym) => (
              <li key={gym.gymName} className="row-item">
                <div className="row-item__lead">
                  <span className={cx('rank-medal', gym.rank <= 3 && `rank-medal--${gym.rank}`)}>
                    <span className="sr-only">Rank </span>
                    {gym.rank}
                  </span>
                  <div>
                    <h3 className="row-item__title">{gym.gymName}</h3>
                    <p className="text-xs text-secondary">
                      {gym.city} · {gym.activeSquads} squads · Top: {gym.topHunter}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm fw-800 text-accent">{(gym.totalAuraEarned / 1_000_000).toFixed(2)}M AURA</div>
                  <div className="text-xs text-emerald">{gym.growthRate}</div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
