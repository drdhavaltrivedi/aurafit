import { clamp } from '@/lib/format';
import { cx } from '@/lib/cx';

export type ProgressTone = 'accent' | 'pink' | 'emerald' | 'blue' | 'danger' | 'orange';

interface ProgressBarProps {
  value: number;
  max?: number;
  /** Accessible name. Use `labelledBy` instead when a visible label exists. */
  label?: string;
  labelledBy?: string;
  valueText?: string;
  tone?: ProgressTone;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export function ProgressBar({ value, max = 100, label, labelledBy, valueText, tone = 'accent', size = 'md', className }: ProgressBarProps) {
  const safe = clamp(Number.isFinite(value) ? value : 0, 0, max);
  const pct = max > 0 ? (safe / max) * 100 : 0;
  return (
    <div
      className={cx('progress', `progress--${size}`, className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(safe)}
      aria-valuetext={valueText}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
    >
      <div className={cx('progress__fill', `fill-${tone}`)} style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
}
