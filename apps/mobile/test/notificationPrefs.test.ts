import { describe, expect, it, vi } from 'vitest';
import type { NotificationSettings } from '@aurafit/shared';
import {
  dailyHourFromReminder,
  parseStoredPush,
  pushUnsupportedReason,
  reminderFromServer,
  routeForNotificationData,
  shouldSuppressLocalReminder,
  wantsPush,
  withTimeout,
} from '../src/lib/notificationPrefs';
import { runSignOutTasks, addSignOutTask } from '../src/lib/signOutTasks';

const S = (o: Partial<NotificationSettings> = {}): NotificationSettings => ({ timezone: 'UTC', streakSaver: true, dailyReminderHour: null, ...o });

describe('pushUnsupportedReason', () => {
  const ok = { isDevice: true, isExpoGo: false, os: 'ios', projectId: 'c7bd98e1' };
  it('supported on a real device build with a projectId', () => {
    expect(pushUnsupportedReason(ok)).toBeNull();
    expect(pushUnsupportedReason({ ...ok, os: 'android' })).toBeNull();
    expect(pushUnsupportedReason({ ...ok, isExpoGo: true })).toBeNull(); // Expo Go on iOS can receive push
  });
  it('explains simulators, Expo Go on Android, web and missing projectId', () => {
    expect(pushUnsupportedReason({ ...ok, isDevice: false })).toMatch(/physical device/);
    expect(pushUnsupportedReason({ ...ok, os: 'android', isExpoGo: true })).toMatch(/Expo Go on Android/);
    expect(pushUnsupportedReason({ ...ok, os: 'web' })).toMatch(/iOS and Android/);
    expect(pushUnsupportedReason({ ...ok, projectId: null })).toMatch(/project id/);
  });
});

describe('local reminder vs server push', () => {
  it('suppresses the local reminder only while the server pushes the daily reminder here', () => {
    expect(shouldSuppressLocalReminder('registered', S({ dailyReminderHour: 18 }))).toBe(true);
    expect(shouldSuppressLocalReminder('registered', S({ dailyReminderHour: null }))).toBe(false);
    expect(shouldSuppressLocalReminder('unsupported', S({ dailyReminderHour: 18 }))).toBe(false);
    expect(shouldSuppressLocalReminder('denied', S({ dailyReminderHour: 18 }))).toBe(false);
    expect(shouldSuppressLocalReminder('registered', null)).toBe(false);
  });

  it('wantsPush when either reminder is on', () => {
    expect(wantsPush(S())).toBe(true);
    expect(wantsPush(S({ streakSaver: false }))).toBe(false);
    expect(wantsPush(S({ streakSaver: false, dailyReminderHour: 7 }))).toBe(true);
    expect(wantsPush(null)).toBe(false);
  });

  it('adopts the server hour (on the hour) and turns off when the server has none', () => {
    const local = { enabled: true, hour: 18, minute: 15 };
    expect(reminderFromServer(S({ dailyReminderHour: 7 }), local)).toEqual({ enabled: true, hour: 7, minute: 0 });
    expect(reminderFromServer(S({ dailyReminderHour: 18 }), local)).toEqual({ enabled: true, hour: 18, minute: 0 });
    expect(reminderFromServer(S({ dailyReminderHour: 18 }), { enabled: true, hour: 18, minute: 0 })).toBeNull();
    expect(reminderFromServer(S({ dailyReminderHour: null }), local)).toEqual({ ...local, enabled: false });
    expect(reminderFromServer(S({ dailyReminderHour: null }), { ...local, enabled: false })).toBeNull();
  });

  it('maps the local reminder to the server hour', () => {
    expect(dailyHourFromReminder({ enabled: true, hour: 6, minute: 0 })).toBe(6);
    expect(dailyHourFromReminder({ enabled: false, hour: 6, minute: 0 })).toBeNull();
  });
});

describe('routeForNotificationData', () => {
  it('routes aurafit://quests to the Quests tab', () => {
    expect(routeForNotificationData({ url: 'aurafit://quests' })).toBe('quests');
    expect(routeForNotificationData({ url: 'aurafit://quests/', kind: 'STREAK_SAVER' })).toBe('quests');
    expect(routeForNotificationData({ url: 'AURAFIT://QUESTS' })).toBe('quests');
  });
  it('ignores anything else', () => {
    for (const d of [null, undefined, 'aurafit://quests', {}, { url: 5 }, { url: 'https://evil.example/quests' }, { url: 'aurafit://guild' }]) {
      expect(routeForNotificationData(d)).toBeNull();
    }
  });
});

describe('storage + helpers', () => {
  it('parseStoredPush is defensive', () => {
    expect(parseStoredPush(null)).toEqual({ optedIn: false, token: null });
    expect(parseStoredPush('garbage')).toEqual({ optedIn: false, token: null });
    expect(parseStoredPush('{"optedIn":true,"token":"ExponentPushToken[x]"}')).toEqual({ optedIn: true, token: 'ExponentPushToken[x]' });
    expect(parseStoredPush('{"optedIn":"yes","token":3}')).toEqual({ optedIn: false, token: null });
  });

  it('withTimeout resolves the fallback on timeout or rejection', async () => {
    vi.useFakeTimers();
    const slow = withTimeout(new Promise<number>(() => {}), 100, -1);
    vi.advanceTimersByTime(100);
    await expect(slow).resolves.toBe(-1);
    vi.useRealTimers();
    await expect(withTimeout(Promise.reject(new Error('x')), 100, 0)).resolves.toBe(0);
    await expect(withTimeout(Promise.resolve(5), 100, 0)).resolves.toBe(5);
  });

  it('sign-out tasks run once each, errors are swallowed, and a hung task cannot block sign-out', async () => {
    const ran: string[] = [];
    const a = addSignOutTask(async () => {
      ran.push('a');
    });
    const b = addSignOutTask(async () => {
      throw new Error('offline');
    });
    const c = addSignOutTask(() => new Promise<void>(() => {}));
    const start = Date.now();
    await runSignOutTasks(50);
    expect(ran).toEqual(['a']);
    expect(Date.now() - start).toBeLessThan(1000);
    a();
    b();
    c();
    await runSignOutTasks(50);
    expect(ran).toEqual(['a']);
  });
});
