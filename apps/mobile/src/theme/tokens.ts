/**
 * Design tokens mirrored from apps/web/src/app/globals.css so web and mobile share one palette.
 * Where a web token fails WCAG AA contrast for text on a filled button, an `on*`/`*Strong`
 * variant is provided for that use.
 */
export type ColorSchemeName = 'dark' | 'light';

export interface Palette {
  bgPage: string;
  bgSurface: string;
  bgElevated: string;
  bgInput: string;
  border: string;
  borderFocus: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  /** Fill colour for primary buttons (AA contrast with `onPrimary`). */
  primaryStrong: string;
  primarySubtle: string;
  onPrimary: string;
  blue: string;
  emerald: string;
  /** Fill colour for success buttons (AA contrast with white text). */
  emeraldStrong: string;
  emeraldSubtle: string;
  orange: string;
  orangeSubtle: string;
  pink: string;
  pinkSubtle: string;
}

export const palettes: Record<ColorSchemeName, Palette> = {
  dark: {
    bgPage: '#0A0C14',
    bgSurface: '#111420',
    bgElevated: '#181B2B',
    bgInput: '#151827',
    border: 'rgba(255, 255, 255, 0.08)',
    borderFocus: '#7C3AED',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    primary: '#A78BFA', // lighter violet so accent *text* on #111420 meets AA
    primaryStrong: '#7C3AED',
    primarySubtle: 'rgba(124, 58, 237, 0.15)',
    onPrimary: '#FFFFFF',
    blue: '#2563EB',
    emerald: '#10B981',
    emeraldStrong: '#047857',
    emeraldSubtle: 'rgba(16, 185, 129, 0.12)',
    orange: '#FB923C',
    orangeSubtle: 'rgba(234, 88, 12, 0.12)',
    pink: '#F472B6',
    pinkSubtle: 'rgba(219, 39, 119, 0.12)',
  },
  light: {
    bgPage: '#F8FAFC',
    bgSurface: '#FFFFFF',
    bgElevated: '#F1F5F9',
    bgInput: '#EDF2F7',
    border: '#E2E8F0',
    borderFocus: '#6366F1',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#64748B',
    primary: '#4F46E5',
    primaryStrong: '#4F46E5',
    primarySubtle: 'rgba(99, 102, 241, 0.1)',
    onPrimary: '#FFFFFF',
    blue: '#2563EB',
    emerald: '#047857',
    emeraldStrong: '#047857',
    emeraldSubtle: 'rgba(5, 150, 105, 0.08)',
    orange: '#C2410C',
    orangeSubtle: 'rgba(194, 65, 12, 0.08)',
    pink: '#BE185D',
    pinkSubtle: 'rgba(190, 24, 93, 0.08)',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  full: 9999,
} as const;

export const fontSize = {
  caption: 12,
  body: 14,
  bodyLg: 15,
  title: 17,
  headline: 20,
  display: 56,
} as const;

/** Minimum touch target (Apple HIG 44pt / Material 48dp; 44 + hitSlop covers both). */
export const MIN_TOUCH_TARGET = 44;
