/**
 * Onboarding helpers for the Expo app. Pure (no React Native / Expo imports) so they can be
 * unit-tested in Node; the screens live in `src/screens/onboarding/`.
 */
import {
  ONBOARDING_STEPS,
  buildOnboardingNotificationSettings,
  isNonFatalSettingsStatus,
  ONBOARDING_NOTIFICATION_SETTINGS_URL,
  type OnboardingStep,
  type UpdateMeRequest,
  type UpdateMeResponse,
  type UserProfile,
} from '@aurafit/shared';

/** AsyncStorage key: the demo-mode intro was shown (or skipped) on this device. */
export const DEMO_INTRO_STORAGE_KEY = 'aurafit:demo-intro:v1';
export const DEMO_INTRO_STEPS = 2;

export const parseDemoIntroSeen = (raw: string | null): boolean => raw === '1';

/** Server-mode gate: only an explicit `false` from the API shows onboarding (older servers omit it). */
export const needsOnboarding = (profile: Pick<UserProfile, 'onboarded'> | null | undefined): boolean =>
  profile?.onboarded === false;

export function nextStep(step: OnboardingStep): OnboardingStep {
  const i = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[Math.min(ONBOARDING_STEPS.length - 1, i + 1)];
}

/** Previous step for Back / Android back; null when there is nothing to go back to. */
export function previousStep(step: OnboardingStep): OnboardingStep | null {
  const i = ONBOARDING_STEPS.indexOf(step);
  if (i <= 0 || step === 'done') return null;
  return ONBOARDING_STEPS[i - 1];
}

/** Minimal surface of the API client used by onboarding (see `src/api/client.ts`). */
export interface OnboardingApi {
  request<T>(path: string, opts?: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown }): Promise<T>;
}

export function updateMe(client: OnboardingApi, body: UpdateMeRequest): Promise<UpdateMeResponse> {
  return client.request<UpdateMeResponse>('/api/v1/me', { method: 'PATCH', body });
}

export type ReminderSyncOutcome = 'saved' | 'unavailable' | 'failed';

/**
 * PUT /api/v1/me/notification-settings (streak-saver push feature). Never throws:
 * 404 / 501 mean the endpoint is not deployed yet and are logged as 'unavailable'.
 */
export async function syncNotificationSettings(
  client: OnboardingApi,
  { reminderHour, streakSaver = true, timezone }: { reminderHour: number | null; streakSaver?: boolean; timezone?: string },
): Promise<ReminderSyncOutcome> {
  try {
    await client.request(ONBOARDING_NOTIFICATION_SETTINGS_URL, {
      method: 'PUT',
      body: buildOnboardingNotificationSettings(reminderHour, timezone, streakSaver),
    });
    return 'saved';
  } catch (err) {
    const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 0;
    if (isNonFatalSettingsStatus(status)) {
      console.info(`[aurafit] notification settings endpoint unavailable (${status}); continuing`);
      return 'unavailable';
    }
    console.warn('[aurafit] saving notification settings failed', status);
    return 'failed';
  }
}
