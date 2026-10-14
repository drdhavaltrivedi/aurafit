import {
  DEFAULT_NOTIFICATION_SETTINGS,
  validateNotificationSettings,
  type NotificationSettings,
} from '@aurafit/shared';
import { rateLimit, requireUser } from '@/lib/api/auth';
import { apiError, BodyError, internalError, json, notConfigured, readJson } from '@/lib/api/http';
import { getNotificationRepository } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 1024;

/** GET /api/v1/me/notification-settings → NotificationSettings (defaults when never saved). */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const repo = getNotificationRepository();
  if (!repo) return notConfigured();
  try {
    const saved = await repo.getSettings(auth.user.profile.id);
    const body: NotificationSettings = saved ?? DEFAULT_NOTIFICATION_SETTINGS;
    return json(body);
  } catch (err) {
    console.error('[GET /api/v1/me/notification-settings]', err);
    return internalError();
  }
}

/**
 * PUT /api/v1/me/notification-settings, body NotificationSettings
 * ({ timezone: IANA, streakSaver: boolean, dailyReminderHour: 0-23 | null }) → the saved settings.
 */
export async function PUT(request: Request): Promise<Response> {
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
  const v = validateNotificationSettings(body);
  if (!v.ok) {
    return apiError(400, 'VALIDATION_FAILED', 'Invalid notification settings.', {
      details: Object.values(v.fieldErrors),
      fieldErrors: v.fieldErrors,
    });
  }

  const repo = getNotificationRepository();
  if (!repo) return notConfigured();
  try {
    return json(await repo.saveSettings(auth.user.profile.id, v.value));
  } catch (err) {
    console.error('[PUT /api/v1/me/notification-settings]', err);
    return internalError();
  }
}
