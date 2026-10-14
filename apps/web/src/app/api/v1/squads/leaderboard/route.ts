import { SQUAD_LEADERBOARD_LIMIT, type SquadLeaderboardResponse } from '@aurafit/shared';
import { internalError, json, notConfigured } from '@/lib/api/http';
import { getSquadRepository } from '@/lib/squads';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/squads/leaderboard (public) → SquadLeaderboardResponse: this week's top squads by
 * weekly aura (name, tag, icon, member count, weekly aura, rank; no member details).
 * Shared caches may keep it for 30 s (the aggregate is the same for every viewer).
 */
export async function GET(): Promise<Response> {
  const repo = getSquadRepository();
  if (!repo) return notConfigured();
  try {
    const body: SquadLeaderboardResponse = await repo.leaderboard(SQUAD_LEADERBOARD_LIMIT, new Date());
    return json(body, 200, { 'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60' });
  } catch (err) {
    console.error('[GET /api/v1/squads/leaderboard]', err);
    return internalError();
  }
}
