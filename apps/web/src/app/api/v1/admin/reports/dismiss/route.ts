import { validateDismissReports, type DismissReportsResponse } from '@aurafit/shared';
import { json } from '@/lib/api/http';
import { adminActionLimiter, adminContext, forbiddenByDb, guarded, MODERATION_ERRORS, readModerationBody, validationFailed } from '@/lib/moderation/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/admin/reports/dismiss { targetType, targetId, note? } (ADMIN) → DismissReportsResponse
 * Marks every open report on the target DISMISSED (audited). 404 NO_OPEN_REPORTS when none are open.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await adminContext(request, 'AUDIT_ANTI_CHEAT', adminActionLimiter);
  if (ctx instanceof Response) return ctx;
  const read = await readModerationBody(request);
  if (!read.ok) return read.response;
  const v = validateDismissReports(read.body);
  if (!v.ok) return validationFailed(v.fieldErrors);
  return guarded('POST /api/v1/admin/reports/dismiss', async () => {
    const r = await ctx.repo.dismissReports(ctx.user.profile.id, v.value);
    switch (r.status) {
      case 'dismissed': {
        const body: DismissReportsResponse = { dismissed: r.count };
        return json(body);
      }
      case 'no_open_reports':
        return MODERATION_ERRORS.noOpenReports();
      case 'invalid':
        return validationFailed({ body: 'Invalid request.' });
      case 'forbidden':
        return forbiddenByDb();
    }
  });
}
