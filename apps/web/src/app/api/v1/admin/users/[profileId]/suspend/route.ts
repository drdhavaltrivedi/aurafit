import { isUuid, validateSuspendUser, type AdminActionResponse } from '@aurafit/shared';
import { json } from '@/lib/api/http';
import { adminActionLimiter, adminContext, forbiddenByDb, guarded, MODERATION_ERRORS, readModerationBody, validationFailed } from '@/lib/moderation/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/admin/users/{profileId}/suspend { reason } (ADMIN) → AdminActionResponse
 * Suspended accounts can sign in and read, but every mutating game endpoint answers 403 SUSPENDED.
 * 400 CANNOT_SUSPEND_SELF | 404 | 409 ALREADY_SUSPENDED / CANNOT_SUSPEND_ADMIN / SYSTEM_PROFILE.
 */
export async function POST(request: Request, { params }: { params: Promise<{ profileId: string }> }): Promise<Response> {
  const ctx = await adminContext(request, 'AUDIT_ANTI_CHEAT', adminActionLimiter);
  if (ctx instanceof Response) return ctx;
  const { profileId } = await params;
  if (!isUuid(profileId)) return MODERATION_ERRORS.notFound('User not found.');
  const read = await readModerationBody(request);
  if (!read.ok) return read.response;
  const v = validateSuspendUser(read.body);
  if (!v.ok) return validationFailed(v.fieldErrors);
  return guarded('POST /api/v1/admin/users/:id/suspend', async () => {
    const r = await ctx.repo.suspend(ctx.user.profile.id, profileId, v.value.reason);
    switch (r.status) {
      case 'suspended': {
        const body: AdminActionResponse = { ok: true };
        return json(body);
      }
      case 'already_suspended':
        return MODERATION_ERRORS.alreadySuspended();
      case 'not_found':
        return MODERATION_ERRORS.notFound('User not found.');
      case 'cannot_suspend_self':
        return MODERATION_ERRORS.cannotSuspendSelf();
      case 'cannot_suspend_admin':
        return MODERATION_ERRORS.cannotSuspendAdmin();
      case 'system_profile':
        return MODERATION_ERRORS.systemProfile();
      case 'invalid':
        return validationFailed({ reason: 'A reason is required.' });
      case 'forbidden':
        return forbiddenByDb();
    }
  });
}
