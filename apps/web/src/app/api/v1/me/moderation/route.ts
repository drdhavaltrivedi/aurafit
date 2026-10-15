import type { AccountModerationResponse } from '@aurafit/shared';
import { requireUser } from '@/lib/api/auth';
import { apiError, json, notConfigured } from '@/lib/api/http';
import { getModerationRepository } from '@/lib/moderation';
import { guarded } from '@/lib/moderation/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me/moderation → AccountModerationResponse: the caller's suspension state and their
 * drops hidden by a moderator (with the admin's reason; never who reported them). Works while
 * suspended (read-only).
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const repo = getModerationRepository();
  if (!repo) return notConfigured();
  return guarded('GET /api/v1/me/moderation', async () => {
    const body: AccountModerationResponse | null = await repo.accountModeration(auth.user.profile.id);
    if (!body) return apiError(404, 'PROFILE_NOT_FOUND', 'No hunter profile exists for this account yet.');
    return json(body);
  });
}
