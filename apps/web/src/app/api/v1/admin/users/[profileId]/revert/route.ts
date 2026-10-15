import { isUuid, validateRevertLog, type RevertLogResponse } from '@aurafit/shared';
import { json } from '@/lib/api/http';
import { adminActionLimiter, adminContext, forbiddenByDb, guarded, MODERATION_ERRORS, readModerationBody, validationFailed } from '@/lib/moderation/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/admin/users/{profileId}/revert { kind: 'QUEST' | 'WORKOUT', logId, note? } (ADMIN)
 * → RevertLogResponse. Deletes that completion and removes its aura from the user. 404 LOG_NOT_FOUND.
 */
export async function POST(request: Request, { params }: { params: Promise<{ profileId: string }> }): Promise<Response> {
  const ctx = await adminContext(request, 'AUDIT_ANTI_CHEAT', adminActionLimiter);
  if (ctx instanceof Response) return ctx;
  const { profileId } = await params;
  if (!isUuid(profileId)) return MODERATION_ERRORS.notFound('User not found.');
  const read = await readModerationBody(request);
  if (!read.ok) return read.response;
  const v = validateRevertLog(read.body);
  if (!v.ok) return validationFailed(v.fieldErrors);
  return guarded('POST /api/v1/admin/users/:id/revert', async () => {
    const r = await ctx.repo.revertLog(ctx.user.profile.id, profileId, v.value);
    switch (r.status) {
      case 'reverted': {
        const body: RevertLogResponse = { auraRemoved: r.auraRemoved, auraPoints: r.auraPoints };
        return json(body);
      }
      case 'not_found':
        return MODERATION_ERRORS.logNotFound();
      case 'invalid':
        return validationFailed({ body: 'Invalid request.' });
      case 'forbidden':
        return forbiddenByDb();
    }
  });
}
