import { isUuid, type AdminActionResponse } from '@aurafit/shared';
import { json } from '@/lib/api/http';
import { adminActionLimiter, adminContext, forbiddenByDb, guarded, MODERATION_ERRORS } from '@/lib/moderation/http';

export const dynamic = 'force-dynamic';

/** POST /api/v1/admin/users/{profileId}/unsuspend (no body) (ADMIN) → AdminActionResponse | 404 | 409 NOT_SUSPENDED */
export async function POST(request: Request, { params }: { params: Promise<{ profileId: string }> }): Promise<Response> {
  const ctx = await adminContext(request, 'AUDIT_ANTI_CHEAT', adminActionLimiter);
  if (ctx instanceof Response) return ctx;
  const { profileId } = await params;
  if (!isUuid(profileId)) return MODERATION_ERRORS.notFound('User not found.');
  return guarded('POST /api/v1/admin/users/:id/unsuspend', async () => {
    const r = await ctx.repo.unsuspend(ctx.user.profile.id, profileId);
    switch (r.status) {
      case 'unsuspended': {
        const body: AdminActionResponse = { ok: true };
        return json(body);
      }
      case 'not_suspended':
        return MODERATION_ERRORS.notSuspended();
      case 'not_found':
        return MODERATION_ERRORS.notFound('User not found.');
      case 'forbidden':
        return forbiddenByDb();
    }
  });
}
