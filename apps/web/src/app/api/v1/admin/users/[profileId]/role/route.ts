import { isUuid, validateSetRole, type SetRoleResponse } from '@aurafit/shared';
import { json } from '@/lib/api/http';
import { adminActionLimiter, adminContext, forbiddenByDb, guarded, MODERATION_ERRORS, readModerationBody, validationFailed } from '@/lib/moderation/http';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/v1/admin/users/{profileId}/role { role } (ADMIN) → SetRoleResponse
 * 400 CANNOT_CHANGE_OWN_ROLE | 404 | 409 LAST_ADMIN / SYSTEM_PROFILE. Audited.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ profileId: string }> }): Promise<Response> {
  const ctx = await adminContext(request, 'AUDIT_ANTI_CHEAT', adminActionLimiter);
  if (ctx instanceof Response) return ctx;
  const { profileId } = await params;
  if (!isUuid(profileId)) return MODERATION_ERRORS.notFound('User not found.');
  const read = await readModerationBody(request);
  if (!read.ok) return read.response;
  const v = validateSetRole(read.body);
  if (!v.ok) return validationFailed(v.fieldErrors);
  return guarded('PUT /api/v1/admin/users/:id/role', async () => {
    const r = await ctx.repo.setRole(ctx.user.profile.id, profileId, v.value.role);
    switch (r.status) {
      case 'updated':
      case 'unchanged': {
        const body: SetRoleResponse = { role: r.role, changed: r.status === 'updated' };
        return json(body);
      }
      case 'not_found':
        return MODERATION_ERRORS.notFound('User not found.');
      case 'cannot_change_self':
        return MODERATION_ERRORS.cannotChangeOwnRole();
      case 'last_admin':
        return MODERATION_ERRORS.lastAdmin();
      case 'system_profile':
        return MODERATION_ERRORS.systemProfile();
      case 'forbidden':
        return forbiddenByDb();
    }
  });
}
