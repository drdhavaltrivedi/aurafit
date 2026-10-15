import { ANALYTICS_RANGE_DAYS, parseAnalyticsRange, type CreatorAnalyticsResponse } from '@aurafit/shared';
import { forbidUnless, rateLimit } from '@/lib/api/auth';
import { apiError, internalError, json } from '@/lib/api/http';
import { analyticsLimiter, creatorContext } from '@/lib/creator/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/creator/analytics?range=7d|30d (VIEW_CREATOR_ANALYTICS) → CreatorAnalyticsResponse.
 * Aggregates only (computed in SQL from user_workout_logs); never athlete identities.
 */
export async function GET(request: Request): Promise<Response> {
  const ctx = await creatorContext(request);
  if (ctx instanceof Response) return ctx;
  const denied = forbidUnless(ctx.user, 'VIEW_CREATOR_ANALYTICS') ?? rateLimit(ctx.user, analyticsLimiter);
  if (denied) return denied;

  const range = parseAnalyticsRange(new URL(request.url).searchParams.get('range'));
  if (!range) {
    return apiError(400, 'VALIDATION_FAILED', 'range must be 7d or 30d.', { fieldErrors: { range: 'Use 7d or 30d.' }, details: ['Use 7d or 30d.'] });
  }

  try {
    const snapshot = await ctx.repo.analytics(ctx.user.profile.id, ANALYTICS_RANGE_DAYS[range], new Date());
    if (!snapshot) return apiError(404, 'PROFILE_NOT_FOUND', 'No hunter profile exists for this account yet.');
    const body: CreatorAnalyticsResponse = { range, ...snapshot };
    return json(body);
  } catch (err) {
    console.error('[GET /api/v1/creator/analytics]', err);
    return internalError();
  }
}
