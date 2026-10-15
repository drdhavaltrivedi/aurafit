import { validateCreatorBadge, type SetCreatorBadgeResponse } from '@aurafit/shared';
import { isValidId, json } from '@/lib/api/http';
import { adminActionLimiter, adminContext, forbiddenByDb, guarded, MODERATION_ERRORS, readModerationBody, validationFailed } from '@/lib/moderation/http';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/v1/admin/drops/{dropId}/badge { badge: string | null } (ADMIN, ASSIGN_USER_ROLES)
 * → SetCreatorBadgeResponse. Text up to 50 chars; null / blank resets to "Verified Creator".
 * Only for drops by verified creators (role CREATOR or ADMIN): 409 NOT_VERIFIED_CREATOR. 404.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ dropId: string }> }): Promise<Response> {
  const ctx = await adminContext(request, 'ASSIGN_USER_ROLES', adminActionLimiter);
  if (ctx instanceof Response) return ctx;
  const { dropId } = await params;
  if (!isValidId(dropId)) return MODERATION_ERRORS.notFound('Workout drop not found.');
  const read = await readModerationBody(request);
  if (!read.ok) return read.response;
  const v = validateCreatorBadge(read.body);
  if (!v.ok) return validationFailed(v.fieldErrors);
  return guarded('PUT /api/v1/admin/drops/:id/badge', async () => {
    const r = await ctx.repo.setCreatorBadge(ctx.user.profile.id, dropId, v.value.badge);
    switch (r.status) {
      case 'updated': {
        const body: SetCreatorBadgeResponse = { badge: r.badge };
        return json(body);
      }
      case 'not_found':
        return MODERATION_ERRORS.notFound('Workout drop not found.');
      case 'not_verified_creator':
        return MODERATION_ERRORS.notVerifiedCreator();
      case 'invalid':
        return validationFailed({ badge: 'Badge must be at most 50 characters.' });
      case 'forbidden':
        return forbiddenByDb();
    }
  });
}
