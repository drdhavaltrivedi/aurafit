import Image from 'next/image';
import { cx } from '@/lib/cx';

/** Hosts allowed by next.config.mjs images.remotePatterns and the CSP img-src. */
const OPTIMIZABLE_HOSTS = new Set(['images.unsplash.com', 'lh3.googleusercontent.com']);

export function isRenderableAvatar(src: string | undefined | null): src is string {
  if (!src) return false;
  if (src.startsWith('/') && !src.startsWith('//')) return true;
  try {
    const u = new URL(src);
    return u.protocol === 'https:' && OPTIMIZABLE_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

interface AvatarProps {
  src: string;
  alt: string;
  size: number;
  shape?: 'circle' | 'rounded';
  ring?: boolean;
  priority?: boolean;
  className?: string;
  /** Used for the initials fallback when `src` is empty or from an unknown host. */
  name?: string;
}

export function Avatar({ src, alt, size, shape = 'circle', ring, priority, className, name }: AvatarProps) {
  const classes = cx('avatar', `avatar--${shape}`, ring && 'avatar--ring', className);
  if (!isRenderableAvatar(src)) {
    const initial = (name ?? alt).replace(/^@/, '').trim().charAt(0) || '?';
    return (
      <span
        className={cx(classes, 'avatar--fallback')}
        style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)) }}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        {initial}
      </span>
    );
  }
  return (
    <span className={classes} style={{ width: size, height: size }}>
      <Image src={src} alt={alt} width={size} height={size} priority={priority} />
    </span>
  );
}
