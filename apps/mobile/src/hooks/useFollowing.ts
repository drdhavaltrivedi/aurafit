import { useCallback, useRef, useState } from 'react';
import { creatorApi } from '../api/creatorApi';
import { creatorErrorText } from '../lib/creator';

export interface FollowingState {
  /** Followed creator ids; null until the first successful load. */
  ids: Set<string> | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
}

/**
 * Creators the signed-in user follows (GET /api/v1/me/following), loaded on demand: the workouts list
 * calls `load` every time "Following" is selected so follows made on a creator page show up right away.
 */
export function useFollowing(): FollowingState {
  const [ids, setIds] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!creatorApi) return;
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await creatorApi.following();
      if (id !== seq.current) return;
      setIds(new Set(res.creators.map((c) => c.id)));
    } catch (err) {
      if (id !== seq.current) return;
      setError(creatorErrorText(err));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  return { ids, loading, error, load };
}
