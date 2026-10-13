import { DELETE_ACCOUNT_CONFIRMATION, utcDateKey, type MeResponse } from '@aurafit/shared';
import { rateLimit, requireUser } from '@/lib/api/auth';
import { apiError, BodyError, internalError, json, NO_STORE_HEADERS, readJson } from '@/lib/api/http';
import { accountDeletionLimiter } from '@/lib/api/rate-limit';
import { rowToProfile, rowToQuest } from '@/lib/data/mappers';
import { createClient as createCookieClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MAX_DELETE_BODY_BYTES = 1024;

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

/**
 * DELETE /api/v1/me, body `DeleteAccountRequest` ({ "confirm": "DELETE" }) → 204.
 * Permanently deletes the caller's auth user; the database cascades to the profile,
 * logs and drops. Cookie callers are signed out (session cookies cleared).
 */
export async function DELETE(request: Request): Promise<Response> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const limited = rateLimit(user, accountDeletionLimiter);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await readJson(request, MAX_DELETE_BODY_BYTES);
  } catch (err) {
    if (err instanceof BodyError) return err.response;
    return apiError(400, 'BAD_REQUEST', 'Unable to read request body');
  }
  const confirm = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).confirm : undefined;
  if (confirm !== DELETE_ACCOUNT_CONFIRMATION) {
    const message = `Type ${DELETE_ACCOUNT_CONFIRMATION} to confirm account deletion.`;
    return apiError(400, 'VALIDATION_FAILED', message, { details: [message], fieldErrors: { confirm: message } });
  }

  try {
    await user.repo.deleteAuthUser(user.authId);
  } catch (err) {
    console.error('[DELETE /api/v1/me]', err);
    return internalError();
  }

  if (user.via === 'cookie') {
    // The user (and its refresh tokens) no longer exist; this clears the session cookies.
    // The Auth server answering 401/403/404 for the dead session is expected and ignored.
    try {
      const client = await createCookieClient();
      await client?.auth.signOut({ scope: 'local' });
    } catch (err) {
      console.warn('[DELETE /api/v1/me] sign-out after deletion failed', err);
    }
  }
  return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
}
