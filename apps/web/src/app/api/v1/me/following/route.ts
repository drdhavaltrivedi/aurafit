import type { FollowingResponse } from '@aurafit/shared';
import { internalError, json } from '@/lib/api/http';
import { creatorContext } from '@/lib/creator/http';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/following (auth) → FollowingResponse (creators the caller follows, newest first). */
export async function GET(request: Request): Promise<Response> {
  const ctx = await creatorContext(request);
  if (ctx instanceof Response) return ctx;
  try {
    const body: FollowingResponse = { creators: await ctx.repo.listFollowing(ctx.user.profile.id) };
    return json(body);
  } catch (err) {
    console.error('[GET /api/v1/me/following]', err);
    return internalError();
  }
}
