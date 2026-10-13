import Image from 'next/image';
import { cx } from '@/lib/cx';

interface AvatarProps {
  src: string;
  alt: string;
  size: number;
  shape?: 'circle' | 'rounded';
  ring?: boolean;
  priority?: boolean;
  className?: string;
}

export function Avatar({ src, alt, size, shape = 'circle', ring, priority, className }: AvatarProps) {
  return (
    <span className={cx('avatar', `avatar--${shape}`, ring && 'avatar--ring', className)} style={{ width: size, height: size }}>
      <Image src={src} alt={alt} width={size} height={size} sizes={`${size}px`} priority={priority} />
    </span>
  );
}
