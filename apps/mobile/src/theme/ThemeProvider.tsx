import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { palettes, type ColorSchemeName, type Palette } from './tokens';

/** `null` means "follow the system appearance". */
export type ThemePreference = ColorSchemeName | null;

interface ThemeContextValue {
  scheme: ColorSchemeName;
  colors: Palette;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  preference,
  children,
}: {
  preference: ThemePreference;
  children: React.ReactNode;
}) {
  const system = useColorScheme();
  // Brand default is dark when the OS reports no preference.
  const scheme: ColorSchemeName = preference ?? (system === 'light' ? 'light' : 'dark');

  const value = useMemo<ThemeContextValue>(
    () => ({ scheme, colors: palettes[scheme], isDark: scheme === 'dark' }),
    [scheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
