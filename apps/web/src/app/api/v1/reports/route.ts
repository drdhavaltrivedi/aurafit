import { validateCreateReport, type CreateReportResponse } from '@aurafit/shared';
import { rateLimit, requireUser } from '@/lib/api/auth';
import { apiError, json, notConfigured } from '@/lib/api/http';
import { getModerationRepository } from '@/lib/moderation';
import { denySuspended } from '@/lib/moderation/guard';
import { guarded, MODERATION_ERRORS, readModerationBody, reportLimiter, validationFailed } from '@/lib/moderation/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/reports { targetType: 'DROP' | 'SQUAD', targetId, reason, note? } → 201 CreateReportResponse
 * 400 VALIDATION_FAILED / CANNOT_REPORT_OWN | 401 | 403 SUSPENDED | 404 NOT_FOUND | 409 ALREADY_REPORTED | 429
 * The reported creator / squad never learns who reported them.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;
  const denied = denySuspended(user) ?? rateLimit(user, reportLimiter);
  if (denied) return denied;

  const read = await readModerationBody(request);
  if (!read.ok) return read.response;
  const v = validateCreateReport(read.body);
  if (!v.ok) return validationFailed(v.fieldErrors, 'Invalid report.');

  const repo = getModerationRepository();
  if (!repo) return notConfigured();

  return guarded('POST /api/v1/reports', async () => {
    const r = await repo.submitReport(user.profile.id, v.value);
    switch (r.status) {
      case 'created': {
        const body: CreateReportResponse = { report: { id: r.reportId, status: 'OPEN' } };
        return json(body, 201);
      }
      case 'already_reported':
        return MODERATION_ERRORS.alreadyReported();
      case 'cannot_report_own':
        return MODERATION_ERRORS.cannotReportOwn();
      case 'target_not_found':
        return MODERATION_ERRORS.notFound(v.value.targetType === 'DROP' ? 'Workout drop not found.' : 'Squad not found.');
      case 'profile_not_found':
        return apiError(404, 'PROFILE_NOT_FOUND', 'No hunter profile exists for this account yet.');
      case 'invalid':
        return validationFailed({ body: 'Invalid report.' }, 'Invalid report.');
    }
  });
}
