import { calculateAuraGain, MAX_AURA_PER_ACTION, utcDateKey, type CompleteWorkoutResponse } from '@aurafit/shared';
import { forbidUnless, rateLimit, requireUser } from '@/lib/api/auth';
import { apiError, internalError, isValidId, json } from '@/lib/api/http';
import { rowToProfile } from '@/lib/data/mappers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/workouts/{dropId}/complete
 * 200 CompleteWorkoutResponse | 401 | 403 (START_WORKOUT) | 404 | 409 ALREADY_COMPLETED | 429
 */
export async function POST(request: Request, { params }: { params: Promise<{ dropId: string }> }): Promise<Response> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const denied = forbidUnless(user, 'START_WORKOUT') ?? rateLimit(user);
  if (denied) return denied;

  const { dropId } = await params;
  if (!isValidId(dropId)) return apiError(404, 'NOT_FOUND', 'Workout drop not found.');

  try {
    const drop = await user.repo.getDrop(dropId);
    if (!drop) return apiError(404, 'NOT_FOUND', 'Workout drop not found.');

    const aura = Math.min(MAX_AURA_PER_ACTION, calculateAuraGain(drop.xpPoints, user.profile.streak_days, drop.auraMultiplier));
    const result = await user.repo.completeWorkout({ userId: user.profile.id, itemId: drop.id, aura, dateKey: utcDateKey() });

    switch (result.status) {
      case 'completed': {
        const body: CompleteWorkoutResponse = { status: 'completed', auraEarned: aura, profile: rowToProfile(result.profile) };
        return json(body);
      }
      case 'already_completed':
        return apiError(409, 'ALREADY_COMPLETED', 'Workout already completed today.');
      case 'not_found':
        return apiError(404, 'NOT_FOUND', 'Workout drop not found.');
      case 'profile_not_found':
        return apiError(404, 'PROFILE_NOT_FOUND', 'No hunter profile exists for this account yet.');
    }
  } catch (err) {
    console.error('[POST /api/v1/workouts/:id/complete]', err);
    return internalError();
  }
}
