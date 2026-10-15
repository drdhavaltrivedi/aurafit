import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreatorProfileResponse } from '@aurafit/shared';
import { isApiError } from '../api';
import { creatorApi } from '../api/creatorApi';
import { creatorErrorText } from '../lib/creator';

export interface CreatorProfileState {
  data: CreatorProfileResponse | null;
  loading: boolean;
  refreshing: boolean;
  /** Load error (null when loaded or loading). */
  error: string | null;
  notFound: boolean;
  reload: () => Promise<void>;
  /** Follow / unfollow with an optimistic count; resolves with an error message, or null on success. */
  toggleFollow: () => Promise<string | null>;
  following: boolean | null;
  followerCount: number;
  followBusy: boolean;
}

/** Public creator page data (GET /api/v1/creators/{handle}) plus Follow / Unfollow. Server mode only. */
export function useCreatorProfile(handle: string, enabled: boolean): CreatorProfileState {
  const [data, setData] = useState<CreatorProfileResponse | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const seq = useRef(0);
  const hasData = useRef(false);

  const reload = useCallback(async () => {
    if (!enabled || !creatorApi) return;
    const id = ++seq.current;
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await creatorApi.profile(handle);
      if (id !== seq.current) return;
      hasData.current = true;
      setData(res);
      setFollowing(res.isFollowing);
      setFollowerCount(res.creator.followerCount);
      setError(null);
      setNotFound(false);
    } catch (err) {
      if (id !== seq.current) return;
      const missing = isApiError(err) && (err.code === 'CREATOR_NOT_FOUND' || err.status === 404);
      setNotFound(missing);
      setError(creatorErrorText(err));
    } finally {
      if (id === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [enabled, handle]);

  useEffect(() => {
    hasData.current = false;
    setData(null);
    void reload();
  }, [reload]);

  const busyRef = useRef(false);
  const toggleFollow = useCallback(async (): Promise<string | null> => {
    if (!creatorApi || busyRef.current || following === null) return null;
    busyRef.current = true;
    setFollowBusy(true);
    const next = !following;
    setFollowing(next);
    setFollowerCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      const res = next ? await creatorApi.follow(handle) : await creatorApi.unfollow(handle);
      setFollowing(res.following);
      setFollowerCount(res.followerCount);
      return null;
    } catch (err) {
      setFollowing(!next);
      setFollowerCount((c) => Math.max(0, c + (next ? -1 : 1)));
      return creatorErrorText(err);
    } finally {
      busyRef.current = false;
      setFollowBusy(false);
    }
  }, [following, handle]);

  return { data, loading, refreshing, error, notFound, reload, toggleFollow, following, followerCount, followBusy };
}
