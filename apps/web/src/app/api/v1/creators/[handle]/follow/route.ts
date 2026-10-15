import type { FollowResponse } from '@aurafit/shared';
import { rateLimit } from '@/lib/api/auth';
import { apiError, internalError, json } from '@/lib/api/http';
import { denySuspended } from '@/lib/moderation/guard';
import { CREATOR_ERRORS, creatorContext, followLimiter, handleFromParam } from '@/lib/creator/http';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ handle: string }> };

/** Shared auth + lookup for follow / unfollow. */
async function prepare(request: Request, params: Params['params']) {
  const ctx = await creatorContext(request);
  if (ctx instanceof Response) return ctx;
  const limited = rateLimit(ctx.user, followLimiter);
  if (limited) return limited;
  const handle = handleFromParam((await params).handle);
  if (!handle) return CREATOR_ERRORS.creatorNotFound();
  const creator = await ctx.repo.findCreatorByHandle(handle);
  if (!creator) return CREATOR_ERRORS.creatorNotFound();
  return { ...ctx, creator };
}

/** POST /api/v1/creators/{handle}/follow (auth) → FollowResponse. Idempotent. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  try {
    const p = await prepare(request, params);
    if (p instanceof Response) return p;
    const suspended = denySuspended(p.user);
    if (suspended) return suspended;
    if (p.creator.id === p.user.profile.id) return CREATOR_ERRORS.cannotFollowSelf();
    const r = await p.repo.follow(p.user.profile.id, p.creator.id);
    switch (r.status) {
      case 'followed':
      case 'already_following': {
        const body: FollowResponse = { following: true, followerCount: r.followerCount };
        return json(body);
      }
      case 'cannot_follow_self':
        return CREATOR_ERRORS.cannotFollowSelf();
      case 'creator_not_found':
        return CREATOR_ERRORS.creatorNotFound();
      case 'profile_not_found':
        return apiError(404, 'PROFILE_NOT_FOUND', 'No hunter profile exists for this account yet.');
    }
  } catch (err) {
    console.error('[POST /api/v1/creators/:handle/follow]', err);
    return internalError();
  }
}

/** DELETE /api/v1/creators/{handle}/follow (auth) → FollowResponse. Idempotent. */
export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  try {
    const p = await prepare(request, params);
    if (p instanceof Response) return p;
    const r = await p.repo.unfollow(p.user.profile.id, p.creator.id);
    const body: FollowResponse = { following: false, followerCount: r.followerCount };
    return json(body);
  } catch (err) {
    console.error('[DELETE /api/v1/creators/:handle/follow]', err);
    return internalError();
  }
}
