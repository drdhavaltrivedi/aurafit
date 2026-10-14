import { SQUAD_ACTIVITY_LIMIT, squadWeekWindow, type SquadActivityResponse } from '@aurafit/shared';
import { internalError, json } from '@/lib/api/http';
import { SQUAD_ERRORS, squadContext } from '@/lib/squads/http';

export const dynamic = 'force-dynamic';

/** GET /api/v1/squads/me/activity (members only) → SquadActivityResponse | 404 NOT_IN_SQUAD. */
export async function GET(request: Request): Promise<Response> {
  const ctx = await squadContext(request, false);
  if (ctx instanceof Response) return ctx;
  try {
    const now = new Date();
    const r = await ctx.repo.activity(ctx.user.profile.id, SQUAD_ACTIVITY_LIMIT, now);
    if (r.status === 'not_in_squad') return SQUAD_ERRORS.notInSquad();
    const window = squadWeekWindow(now);
    const body: SquadActivityResponse = {
      week: { start: r.weekStart || window.start.toISOString(), end: window.end.toISOString() },
      items: r.items.map((i) => ({ ...i, isYou: i.profileId === ctx.user.profile.id })),
    };
    return json(body);
  } catch (err) {
    console.error('[GET /api/v1/squads/me/activity]', err);
    return internalError();
  }
}
