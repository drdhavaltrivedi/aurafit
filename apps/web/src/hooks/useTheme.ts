'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { readRaw, STORAGE_KEYS, writeRaw } from '@/lib/storage';
import { isTheme, type Theme } from '@/lib/theme';

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

const getSnapshot = (): Theme => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
const getServerSnapshot = (): Theme => 'dark';

function apply(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/** Theme is owned by the `data-theme` attribute set pre-paint by THEME_INIT_SCRIPT. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Follow OS changes until the user picks a theme explicitly.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (e: MediaQueryListEvent) => {
      if (!isTheme(readRaw(STORAGE_KEYS.theme))) apply(e.matches ? 'light' : 'dark');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    apply(next);
    writeRaw(STORAGE_KEYS.theme, next);
  }, []);

  const toggleTheme = useCallback(() => setTheme(getSnapshot() === 'dark' ? 'light' : 'dark'), [setTheme]);

  return { theme, setTheme, toggleTheme };
}
