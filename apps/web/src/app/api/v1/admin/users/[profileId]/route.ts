import { isUuid, type AdminUserSummaryResponse } from '@aurafit/shared';
import { json } from '@/lib/api/http';
import { adminContext, adminReadLimiter, forbiddenByDb, guarded, MODERATION_ERRORS } from '@/lib/moderation/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/users/{profileId} (ADMIN, AUDIT_ANTI_CHEAT) → AdminUserSummaryResponse | 404
 * Profile, counts, recent completions (revertable) and the audit trail for this user.
 */
export async function GET(request: Request, { params }: { params: Promise<{ profileId: string }> }): Promise<Response> {
  const ctx = await adminContext(request, 'AUDIT_ANTI_CHEAT', adminReadLimiter);
  if (ctx instanceof Response) return ctx;
  const { profileId } = await params;
  if (!isUuid(profileId)) return MODERATION_ERRORS.notFound('User not found.');
  return guarded('GET /api/v1/admin/users/:id', async () => {
    const r = await ctx.repo.userSummary(ctx.user.profile.id, profileId);
    switch (r.status) {
      case 'ok': {
        const body: AdminUserSummaryResponse = { user: r.user };
        return json(body);
      }
      case 'not_found':
        return MODERATION_ERRORS.notFound('User not found.');
      case 'forbidden':
        return forbiddenByDb();
    }
  });
}
