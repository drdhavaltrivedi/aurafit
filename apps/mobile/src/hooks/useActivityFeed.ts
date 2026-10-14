import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EMPTY_FEED,
  activityStorageKey,
  addActivity,
  markAllRead as markRead,
  parseFeed,
  unreadCount,
  type ActivityFeed,
  type NewActivity,
} from '../lib/activity';

export interface ActivityFeedStore {
  feed: ActivityFeed;
  loaded: boolean;
  unread: number;
  log: (...entries: NewActivity[]) => void;
  markAllRead: () => void;
  clear: () => void;
}

/** Activity feed persisted per scope (`demo` or a profile id) in AsyncStorage. */
export function useActivityFeed(scope: string | null): ActivityFeedStore {
  const [feed, setFeed] = useState<ActivityFeed>(EMPTY_FEED);
  const [loaded, setLoaded] = useState(false);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  useEffect(() => {
    let active = true;
    setFeed(EMPTY_FEED);
    setLoaded(false);
    if (!scope) return;
    AsyncStorage.getItem(activityStorageKey(scope))
      .then((raw) => {
        if (active) setFeed(parseFeed(raw));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [scope]);

  const update = useCallback((fn: (f: ActivityFeed) => ActivityFeed) => {
    setFeed((prev) => {
      const next = fn(prev);
      const s = scopeRef.current;
      if (next !== prev && s) AsyncStorage.setItem(activityStorageKey(s), JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const log = useCallback((...entries: NewActivity[]) => update((f) => addActivity(f, entries, Date.now())), [update]);
  const markAllRead = useCallback(() => update((f) => markRead(f, Date.now())), [update]);
  const clear = useCallback(() => update(() => ({ items: [], lastReadAt: Date.now() })), [update]);

  return useMemo(
    () => ({ feed, loaded, unread: unreadCount(feed), log, markAllRead, clear }),
    [feed, loaded, log, markAllRead, clear]
  );
}
