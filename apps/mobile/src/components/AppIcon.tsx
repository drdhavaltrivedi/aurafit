import React from 'react';
import {
  Car,
  Crown,
  Dog,
  Dumbbell,
  Flame,
  Shield,
  Skull,
  Sofa,
  Sparkles,
  Swords,
  Trophy,
  Zap,
  type LucideIcon,
} from './icons';
import { toIconKey, type IconKey } from '@aurafit/shared';
import { useTheme } from '../theme/ThemeProvider';

/** Shared icon keys (quest/squad data) → Lucide components; mirrors the web mapping. */
export const ICON_COMPONENTS: Record<IconKey, LucideIcon> = {
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

export type AppIconProps = (
  | {
      /** An IconKey; unknown values (e.g. legacy emoji from old data) fall back to the default icon. */
      name: IconKey | string;
      icon?: never;
    }
  | {
      /** A Lucide component, for UI chrome icons that are not data-driven (Check, Moon, X…). */
      icon: LucideIcon;
      name?: never;
    }
) & {
  size?: number;
  /** Defaults to the theme's primary text colour. */
  color?: string;
  strokeWidth?: number;
  /** Icons are decorative by default; pass a label to expose one to screen readers. */
  accessibilityLabel?: string;
};

export function AppIcon({ name, icon, size = 20, color, strokeWidth = 2, accessibilityLabel }: AppIconProps) {
  const { colors } = useTheme();
  const Icon = icon ?? ICON_COMPONENTS[toIconKey(name)];
  return <Icon size={size} color={color ?? colors.textPrimary} strokeWidth={strokeWidth} {...a11yProps(accessibilityLabel)} />;
}

/** Accessibility props for an SVG icon: hidden unless a label is given. */
export function a11yProps(label?: string) {
  return label
    ? ({ accessible: true, accessibilityRole: 'image', accessibilityLabel: label } as const)
    : ({ accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const);
}
