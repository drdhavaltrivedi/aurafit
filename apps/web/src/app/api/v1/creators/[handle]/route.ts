import { type CreatorProfileResponse } from '@aurafit/shared';
import { requireUser } from '@/lib/api/auth';
import { internalError, json, notConfigured } from '@/lib/api/http';
import { getCreatorRepository } from '@/lib/creator';
import { CREATOR_ERRORS, handleFromParam } from '@/lib/creator/http';
import { getRepository } from '@/lib/data';
import { loadCreatorProfile } from '@/lib/creator/profile';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/creators/{handle} (public) → CreatorProfileResponse | 404 CREATOR_NOT_FOUND.
 * `isFollowing` is filled in when the request carries a valid session / bearer token.
 */
export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }): Promise<Response> {
  const handle = handleFromParam((await params).handle);
  if (!handle) return CREATOR_ERRORS.creatorNotFound();
  const repo = getCreatorRepository();
  const game = getRepository();
  if (!repo || !game) return notConfigured();

  // Optional viewer: anonymous when there are no (valid) credentials.
  const auth = await requireUser(request);
  const viewerId = auth.ok ? auth.user.profile.id : null;

  try {
    const body: CreatorProfileResponse | null = await loadCreatorProfile(repo, game, handle, viewerId);
    if (!body) return CREATOR_ERRORS.creatorNotFound();
    return json(body);
  } catch (err) {
    console.error('[GET /api/v1/creators/:handle]', err);
    return internalError();
  }
}
