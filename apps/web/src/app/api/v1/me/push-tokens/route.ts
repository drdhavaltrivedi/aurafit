import { validateRegisterPushToken, validateUnregisterPushToken, type ValidationResult } from '@aurafit/shared';
import { rateLimit, requireUser, type AuthedUser } from '@/lib/api/auth';
import { apiError, BodyError, internalError, notConfigured, NO_STORE_HEADERS, readJson } from '@/lib/api/http';
import { getNotificationRepository, type NotificationRepository } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 1024;

async function handle<T>(
  request: Request,
  method: string,
  validate: (input: unknown) => ValidationResult<T>,
  apply: (repo: NotificationRepository, user: AuthedUser, value: T) => Promise<void>,
): Promise<Response> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const limited = rateLimit(auth.user);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await readJson(request, MAX_BODY_BYTES);
  } catch (err) {
    if (err instanceof BodyError) return err.response;
    return apiError(400, 'BAD_REQUEST', 'Unable to read request body');
  }
  const v = validate(body);
  if (!v.ok) {
    return apiError(400, 'VALIDATION_FAILED', 'Invalid push token request.', {
      details: Object.values(v.fieldErrors),
      fieldErrors: v.fieldErrors,
    });
  }
  const repo = getNotificationRepository();
  if (!repo) return notConfigured();
  try {
    await apply(repo, auth.user, v.value);
    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  } catch (err) {
    console.error(`[${method} /api/v1/me/push-tokens]`, err);
    return internalError();
  }
}

/** POST /api/v1/me/push-tokens { token, platform } → 204. Registers (or re-registers) this device. */
export function POST(request: Request): Promise<Response> {
  return handle(request, 'POST', validateRegisterPushToken, (repo, user, v) =>
    repo.upsertPushToken(user.profile.id, v.token, v.platform),
  );
}

/** DELETE /api/v1/me/push-tokens { token } → 204. Removes the token if it is the caller's. */
export function DELETE(request: Request): Promise<Response> {
  return handle(request, 'DELETE', validateUnregisterPushToken, (repo, user, v) => repo.deletePushToken(user.profile.id, v.token));
}
