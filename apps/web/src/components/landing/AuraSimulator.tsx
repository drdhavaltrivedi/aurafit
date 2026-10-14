'use client';

import { useId, useMemo, useState } from 'react';
import { getRankFromAura, RANK_THRESHOLDS, type HunterRank } from '@aurafit/shared';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCompact, formatNumber } from '@/lib/format';

const MAX = 65000;
const RANK_SHORT: Record<HunterRank, string> = {
  'E-RANK': 'E',
  'D-RANK': 'D',
  'C-RANK': 'C',
  'B-RANK': 'B',
  'A-RANK': 'A',
  'S-RANK': 'S',
  MONARCH: 'M',
};

function statusFor(aura: number): string {
  if (aura >= 60000) return 'Monarch rank unlocked — global leaderboard dominance.';
  if (aura >= 30000) return 'S-Rank Hunter — elite conditioning and top squad status.';
  return 'Hunter in training — keep locking in daily pushups and micro-snacks.';
}

export function AuraSimulator() {
  const [aura, setAura] = useState(8450);
  const inputId = useId();
  const rank = useMemo(() => getRankFromAura(aura).rank, [aura]);
  const ticks = useMemo(() => Object.entries(RANK_THRESHOLDS) as [HunterRank, number][], []);

  return (
    <Card as="section" variant="feature" className="simulator" aria-labelledby="sim-title">
      <div className="card-header">
        <div className="card-header__text">
          <p className="eyebrow text-accent">Interactive simulator</p>
          <h2 id="sim-title" className="card-header__title">
            Test your Hunter rank &amp; Aura
          </h2>
        </div>
        <Badge tone="accent" outline>
          Rank: {rank}
        </Badge>
      </div>

      <div className="simulator__control">
        <div className="row-between text-sm">
          <label htmlFor={inputId} className="text-secondary">
            Simulated Aura
          </label>
          <output htmlFor={inputId} className="text-accent fw-800">
            {formatNumber(aura)} AURA
          </output>
        </div>
        <input
          id={inputId}
          className="range"
          type="range"
          min={0}
          max={MAX}
          step={500}
          value={aura}
          aria-valuetext={`${formatNumber(aura)} Aura, ${rank}`}
          onChange={(e) => setAura(Number(e.target.value))}
          style={{ ['--range-pct' as string]: `${(aura / MAX) * 100}%` }}
        />
        <ol className="simulator__ticks" aria-label="Rank thresholds">
          {ticks.map(([r, min]) => (
            <li key={r} className={r === rank ? 'is-active' : undefined}>
              <span className="simulator__tick-long">
                {r === 'MONARCH' ? 'Monarch' : r} ({formatCompact(min)})
              </span>
              <span className="simulator__tick-short" aria-hidden="true">
                {RANK_SHORT[r]}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <p className="callout">
        <strong>Status:</strong> {statusFor(aura)}
      </p>
    </Card>
  );
}
