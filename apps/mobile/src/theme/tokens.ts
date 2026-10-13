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
  cyan: string;
  cyanSubtle: string;
  danger: string;
  dangerSubtle: string;
  pink: string;
  pinkSubtle: string;
}

export const palettes: Record<ColorSchemeName, Palette> = {
  dark: {
    bgPage: '#070A12',
    bgSurface: '#0D1322',
    bgElevated: '#131B2E',
    bgInput: '#101726',
    border: 'rgba(255, 255, 255, 0.08)',
    borderFocus: '#8B5CF6',
    textPrimary: '#FFFFFF',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    primary: '#8B5CF6',
    primaryStrong: '#7C3AED',
    primarySubtle: 'rgba(139, 92, 246, 0.16)',
    onPrimary: '#FFFFFF',
    blue: '#38BDF8',
    cyan: '#06B6D4',
    cyanSubtle: 'rgba(6, 182, 212, 0.16)',
    emerald: '#10B981',
    emeraldStrong: '#059669',
    emeraldSubtle: 'rgba(16, 185, 129, 0.16)',
    danger: '#EF4444',
    dangerSubtle: 'rgba(239, 68, 68, 0.16)',
    orange: '#FB923C',
    orangeSubtle: 'rgba(251, 146, 60, 0.14)',
    pink: '#F472B6',
    pinkSubtle: 'rgba(244, 114, 182, 0.14)',
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
    cyan: '#0891B2',
    cyanSubtle: 'rgba(8, 145, 178, 0.08)',
    emerald: '#047857',
    emeraldStrong: '#047857',
    emeraldSubtle: 'rgba(5, 150, 105, 0.08)',
    danger: '#DC2626',
    dangerSubtle: 'rgba(220, 38, 38, 0.08)',
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
