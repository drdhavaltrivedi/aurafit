'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type AppView = 'LANDING' | 'APP';

const ARENA_HASH = '#arena';
const NAV_EVENT = 'aurafit:navigate';

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  window.addEventListener('popstate', cb);
  window.addEventListener(NAV_EVENT, cb);
  return () => {
    window.removeEventListener('hashchange', cb);
    window.removeEventListener('popstate', cb);
    window.removeEventListener(NAV_EVENT, cb);
  };
}

const getSnapshot = (): AppView => (window.location.hash === ARENA_HASH ? 'APP' : 'LANDING');
const getServerSnapshot = (): AppView => 'LANDING';

/**
 * Landing vs. Arena view stored in the URL hash, so it is linkable and the
 * browser back button works.
 */
export function useHashView() {
  const view = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const navigate = useCallback((next: AppView) => {
    if (getSnapshot() === next) return;
    const url = next === 'APP' ? ARENA_HASH : window.location.pathname + window.location.search;
    window.history.pushState(null, '', url);
    window.dispatchEvent(new Event(NAV_EVENT));
  }, []);

  return { view, navigate };
}
