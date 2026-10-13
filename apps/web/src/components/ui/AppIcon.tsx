import { Car, Crown, Dog, Dumbbell, Flame, Shield, Skull, Sofa, Sparkles, Swords, Trophy, Zap, type LucideIcon } from 'lucide-react';
import { toIconKey, type IconKey } from '@aurafit/shared';
import { cx } from '@/lib/cx';

/** Shared icon keys (quest icons, squad avatars) → Lucide components. */
const ICONS: Record<IconKey, LucideIcon> = {
  zap: Zap,
  flame: Flame,
  sparkles: Sparkles,
  skull: Skull,
  swords: Swords,
  car: Car,
  dog: Dog,
  sofa: Sofa,
  dumbbell: Dumbbell,
  trophy: Trophy,
  shield: Shield,
  crown: Crown,
};

interface AppIconProps {
  /** An `IconKey`; unknown / legacy values are normalised with `toIconKey`. */
  name: IconKey | string;
  /** CSS length or px number. Defaults to `1em` so the icon follows the surrounding type size. */
  size?: number | string;
  className?: string;
  /** Accessible label. When omitted the icon is decorative (`aria-hidden`). */
  label?: string;
}

export function AppIcon({ name, size = '1em', className, label }: AppIconProps) {
  const Icon = ICONS[toIconKey(name)];
  return (
    <Icon
      width={size}
      height={size}
      strokeWidth={2}
      className={cx('app-icon', className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
    />
  );
}
