import { utcDateKey, type MeResponse } from '@aurafit/shared';
import { requireUser } from '@/lib/api/auth';
import { internalError, json } from '@/lib/api/http';
import { rowToProfile, rowToQuest } from '@/lib/data/mappers';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me → MeResponse (profile + today's quest board). */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { profile, repo } = auth.user;
  try {
    const [quests, done] = await Promise.all([repo.listQuests(), repo.listCompletedQuestIds(profile.id, utcDateKey())]);
    const completed = new Set(done);
    const body: MeResponse = {
      profile: rowToProfile(profile),
      quests: quests.map((q) => rowToQuest(q, completed.has(q.id))),
    };
    return json(body);
  } catch (err) {
    console.error('[GET /api/v1/me]', err);
    return internalError();
  }
}
