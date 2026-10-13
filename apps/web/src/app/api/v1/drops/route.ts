import { buildWorkoutDrop, validateDropInput, type CreateDropResponse, type DropsResponse } from '@aurafit/shared';
import { forbidUnless, rateLimit, requireUser } from '@/lib/api/auth';
import { apiError, BodyError, internalError, json, notConfigured, readJson } from '@/lib/api/http';
import { getRepository } from '@/lib/data';
import { rowToProfile } from '@/lib/data/mappers';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 4 * 1024;

/** GET /api/v1/drops (public) → WorkoutDrop[] newest first. */
export async function GET(): Promise<Response> {
  const repo = getRepository();
  if (!repo) return notConfigured();
  try {
    const drops: DropsResponse = await repo.listDrops();
    return json(drops);
  } catch (err) {
    console.error('[GET /api/v1/drops]', err);
    return internalError();
  }
}

/** POST /api/v1/drops (PUBLISH_WORKOUT_DROP) CreateDropRequest → 201 { drop }. */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const denied = forbidUnless(user, 'PUBLISH_WORKOUT_DROP') ?? rateLimit(user);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await readJson(request, MAX_BODY_BYTES);
  } catch (err) {
    if (err instanceof BodyError) return err.response;
    return apiError(400, 'BAD_REQUEST', 'Unable to read request body');
  }

  const result = validateDropInput(body);
  if (!result.ok) {
    const fieldErrors = Object.fromEntries(Object.entries(result.errors).filter((e): e is [string, string] => typeof e[1] === 'string'));
    return apiError(400, 'VALIDATION_FAILED', 'Invalid workout drop.', { details: Object.values(fieldErrors), fieldErrors });
  }

  try {
    const creator = rowToProfile(user.profile);
    const drop = await user.repo.createDrop(buildWorkoutDrop(result.value, creator));
    const response: CreateDropResponse = { drop };
    return json(response, 201);
  } catch (err) {
    console.error('[POST /api/v1/drops]', err);
    return internalError();
  }
}
