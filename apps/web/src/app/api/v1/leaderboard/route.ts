import { LEADERBOARD_LIMIT, type LeaderboardResponse } from '@aurafit/shared';
import { internalError, json, notConfigured } from '@/lib/api/http';
import { getRepository } from '@/lib/data';

export const dynamic = 'force-dynamic';

/** GET /api/v1/leaderboard (public) → top hunters by aura (public fields only) + squads. */
export async function GET(): Promise<Response> {
  const repo = getRepository();
  if (!repo) return notConfigured();
  try {
    const body: LeaderboardResponse = await repo.leaderboard(LEADERBOARD_LIMIT);
    return json(body);
  } catch (err) {
    console.error('[GET /api/v1/leaderboard]', err);
    return internalError();
  }
}
