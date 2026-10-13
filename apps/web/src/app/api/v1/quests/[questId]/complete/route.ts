import { calculateAuraGain, MAX_AURA_PER_ACTION, utcDateKey, type CompleteQuestResponse } from '@aurafit/shared';
import { forbidUnless, rateLimit, requireUser } from '@/lib/api/auth';
import { apiError, internalError, isValidId, json } from '@/lib/api/http';
import { rowToProfile } from '@/lib/data/mappers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/quests/{questId}/complete
 * 200 CompleteQuestResponse | 401 | 403 (DO_QUESTS) | 404 | 409 ALREADY_COMPLETED | 429
 */
export async function POST(request: Request, { params }: { params: Promise<{ questId: string }> }): Promise<Response> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const denied = forbidUnless(user, 'DO_QUESTS') ?? rateLimit(user);
  if (denied) return denied;

  const { questId } = await params;
  if (!isValidId(questId)) return apiError(404, 'NOT_FOUND', 'Quest not found.');

  try {
    const quest = await user.repo.getQuest(questId);
    if (!quest) return apiError(404, 'NOT_FOUND', 'Quest not found.');

    // Aura is computed with the shared formula; the DB function re-checks the cap.
    const aura = Math.min(MAX_AURA_PER_ACTION, calculateAuraGain(quest.aura_reward, user.profile.streak_days));
    const result = await user.repo.completeQuest({ userId: user.profile.id, itemId: quest.id, aura, dateKey: utcDateKey() });

    switch (result.status) {
      case 'completed': {
        const body: CompleteQuestResponse = {
          status: 'completed',
          auraEarned: aura,
          statGain: { stat: quest.stat_reward_stat, amount: quest.stat_reward_amount },
          profile: rowToProfile(result.profile),
        };
        return json(body);
      }
      case 'already_completed':
        return apiError(409, 'ALREADY_COMPLETED', 'Quest already completed today.');
      case 'not_found':
        return apiError(404, 'NOT_FOUND', 'Quest not found.');
      case 'profile_not_found':
        return apiError(404, 'PROFILE_NOT_FOUND', 'No hunter profile exists for this account yet.');
    }
  } catch (err) {
    console.error('[POST /api/v1/quests/:id/complete]', err);
    return internalError();
  }
}
