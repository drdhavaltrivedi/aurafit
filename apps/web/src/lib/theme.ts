import { STORAGE_KEYS } from './storage';

export type Theme = 'dark' | 'light';

export const isTheme = (v: unknown): v is Theme => v === 'dark' || v === 'light';

/**
 * Runs before first paint (inlined in <head>) so the correct theme is applied
 * without a flash. Falls back to the OS preference when nothing is saved.
 */
export const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEYS.theme,
)});if(t!=='light'&&t!=='dark'){t=localStorage.getItem('aurafit_theme_v1');}if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}d.setAttribute('data-theme',t);}catch(e){d.setAttribute('data-theme','dark');}})();`;
