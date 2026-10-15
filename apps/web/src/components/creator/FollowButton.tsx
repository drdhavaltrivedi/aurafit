'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserCheck, UserPlus } from 'lucide-react';
import { creatorProfilePath } from '@aurafit/shared';
import { Button } from '@/components/ui/Button';
import { creatorApi } from '@/lib/creator/client';
import { formatNumber } from '@/lib/format';

interface FollowButtonProps {
  handle: string;
  initialCount: number;
  signedIn: boolean;
  isSelf: boolean;
}

/**
 * Follower count + Follow / Following toggle. Signed-out visitors get a sign-in link (login-gated);
 * the follow state is loaded client-side from GET /api/v1/creators/{handle}.
 */
export function FollowButton({ handle, initialCount, signedIn, isSelf }: FollowButtonProps) {
  const [count, setCount] = useState(initialCount);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn || isSelf) return;
    let live = true;
    void creatorApi.profile(handle).then((res) => {
      if (!live || !res.ok) return;
      setFollowing(res.data.isFollowing === true);
      setCount(res.data.creator.followerCount);
    });
    return () => {
      live = false;
    };
  }, [handle, signedIn, isSelf]);

  const toggle = async () => {
    if (busy || following === null) return;
    setBusy(true);
    setError(null);
    const next = !following;
    setFollowing(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    const res = next ? await creatorApi.follow(handle) : await creatorApi.unfollow(handle);
    if (res.ok) {
      setFollowing(res.data.following);
      setCount(res.data.followerCount);
    } else {
      setFollowing(!next);
      setCount((c) => Math.max(0, c + (next ? -1 : 1)));
      setError(res.message);
    }
    setBusy(false);
  };

  const countLabel = `${formatNumber(count)} ${count === 1 ? 'follower' : 'followers'}`;

  return (
    <div className="stack-2">
      <div className="btn-row">
        <span className="text-sm fw-700" aria-live="polite" data-testid="follower-count">
          {countLabel}
        </span>
        {isSelf ? (
          <span className="text-sm text-secondary">This is your creator page</span>
        ) : !signedIn ? (
          <Link href={`/login?next=${encodeURIComponent(creatorProfilePath(handle))}`} className="btn btn--primary btn--md">
            <UserPlus aria-hidden="true" className="btn__icon" /> Sign in to follow
          </Link>
        ) : (
          <Button
            variant={following ? 'secondary' : 'primary'}
            onClick={() => void toggle()}
            disabled={following === null || busy}
            aria-pressed={following === true}
            leadingIcon={following ? <UserCheck /> : <UserPlus />}
          >
            {following ? 'Following' : 'Follow'}
          </Button>
        )}
      </div>
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
