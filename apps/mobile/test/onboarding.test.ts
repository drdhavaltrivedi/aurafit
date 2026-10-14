import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  needsOnboarding,
  nextStep,
  parseDemoIntroSeen,
  previousStep,
  syncNotificationSettings,
  updateMe,
  type OnboardingApi,
} from '../src/lib/onboarding';

const fakeApi = (impl: (path: string, opts?: { method?: string; body?: unknown }) => Promise<unknown>) => {
  const calls: Array<{ path: string; opts?: { method?: string; body?: unknown } }> = [];
  const api: OnboardingApi = {
    request: (async (path: string, opts?: { method?: string; body?: unknown }) => {
      calls.push({ path, opts });
      return impl(path, opts);
    }) as OnboardingApi['request'],
  };
  return { api, calls };
};

afterEach(() => vi.restoreAllMocks());

describe('onboarding gate and steps', () => {
  it('shows onboarding only for an explicit onboarded=false', () => {
    expect(needsOnboarding({ onboarded: false })).toBe(true);
    expect(needsOnboarding({ onboarded: true })).toBe(false);
    expect(needsOnboarding({})).toBe(false); // older server: never trap the user
    expect(needsOnboarding(null)).toBe(false);
  });

  it('walks forward and back (Android back never leaves the finish screen)', () => {
    expect(nextStep('welcome')).toBe('goal');
    expect(nextStep('reminder')).toBe('done');
    expect(nextStep('done')).toBe('done');
    expect(previousStep('level')).toBe('goal');
    expect(previousStep('welcome')).toBeNull();
    expect(previousStep('done')).toBeNull();
  });

  it('parses the demo intro flag', () => {
    expect(parseDemoIntroSeen('1')).toBe(true);
    expect(parseDemoIntroSeen(null)).toBe(false);
    expect(parseDemoIntroSeen('true')).toBe(false);
  });
});

describe('onboarding API calls', () => {
  it('PATCHes /api/v1/me', async () => {
    const { api, calls } = fakeApi(async () => ({ profile: { onboarded: true } }));
    await updateMe(api, { fitnessGoal: 'MOBILITY', completeOnboarding: true });
    expect(calls).toEqual([{ path: '/api/v1/me', opts: { method: 'PATCH', body: { fitnessGoal: 'MOBILITY', completeOnboarding: true } } }]);
  });

  it('PUTs notification settings with timezone, streak saver and hour', async () => {
    const { api, calls } = fakeApi(async () => ({}));
    expect(await syncNotificationSettings(api, { reminderHour: 7, timezone: 'Asia/Tokyo' })).toBe('saved');
    expect(calls[0]).toEqual({
      path: '/api/v1/me/notification-settings',
      opts: { method: 'PUT', body: { timezone: 'Asia/Tokyo', streakSaver: true, dailyReminderHour: 7 } },
    });
  });

  it.each([404, 501])('%d is non-fatal', async (status) => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { api } = fakeApi(async () => {
      throw Object.assign(new Error('nope'), { status });
    });
    expect(await syncNotificationSettings(api, { reminderHour: null, streakSaver: false })).toBe('unavailable');
  });

  it('other failures resolve to failed (never throw)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { api } = fakeApi(async () => {
      throw Object.assign(new Error('boom'), { status: 500 });
    });
    expect(await syncNotificationSettings(api, { reminderHour: 18 })).toBe('failed');
    const net = fakeApi(async () => {
      throw new Error('offline');
    });
    expect(await syncNotificationSettings(net.api, { reminderHour: 18 })).toBe('failed');
  });
});
