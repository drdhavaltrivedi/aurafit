import {
  API_ROUTES,
  buildOnboardingNotificationSettings,
  isNonFatalSettingsStatus,
  ONBOARDING_NOTIFICATION_SETTINGS_URL,
  type UpdateMeRequest,
  type UpdateMeResponse,
} from '@aurafit/shared';
import { apiFetch, type ApiResult } from '@/lib/api-client';

export function updateMe(body: UpdateMeRequest, fetchImpl?: typeof fetch): Promise<ApiResult<UpdateMeResponse>> {
  return apiFetch<UpdateMeResponse>(API_ROUTES.me, { method: 'PATCH', body: JSON.stringify(body) }, fetchImpl);
}

export type ReminderSaveOutcome = 'saved' | 'unavailable' | 'failed';

/**
 * PUT /api/v1/me/notification-settings (owned by the streak-saver push feature). Never throws.
 * 404 / 501 (endpoint not deployed yet) are logged and reported as 'unavailable'.
 */
export async function saveReminderSettings(
  reminderHour: number | null,
  streakSaver: boolean,
  fetchImpl?: typeof fetch,
): Promise<ReminderSaveOutcome> {
  const body = buildOnboardingNotificationSettings(reminderHour, undefined, streakSaver);
  const res = await apiFetch<unknown>(ONBOARDING_NOTIFICATION_SETTINGS_URL, { method: 'PUT', body: JSON.stringify(body) }, fetchImpl);
  if (res.ok) return 'saved';
  if (isNonFatalSettingsStatus(res.status)) {
    console.info('[onboarding] notification settings endpoint unavailable (%d); continuing', res.status);
    return 'unavailable';
  }
  console.warn('[onboarding] saving notification settings failed', res.status, res.code);
  return 'failed';
}
