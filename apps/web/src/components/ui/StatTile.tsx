import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import type { Tone } from './Badge';

interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  hintTone?: Tone;
}

export function StatTile({ label, value, hint, tone = 'neutral', hintTone = 'emerald' }: StatTileProps) {
  return (
    <div className="stat-tile">
      <dt className="stat-tile__label">{label}</dt>
      <dd className={cx('stat-tile__value', `text-${tone}`)}>{value}</dd>
      {hint && <dd className={cx('stat-tile__hint', `text-${hintTone}`)}>{hint}</dd>}
    </div>
  );
}

export function StatGrid({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <dl className="stat-grid" aria-label={label}>
      {children}
    </dl>
  );
}
