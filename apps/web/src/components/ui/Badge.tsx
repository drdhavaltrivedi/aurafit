import type { HTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

export type Tone = 'accent' | 'pink' | 'emerald' | 'blue' | 'orange' | 'neutral';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  outline?: boolean;
  size?: 'sm' | 'md';
}

export function Badge({ tone = 'accent', outline, size = 'md', className, ...rest }: BadgeProps) {
  return <span className={cx('badge', `tone-${tone}`, `badge--${size}`, outline && 'badge--outline', className)} {...rest} />;
}
