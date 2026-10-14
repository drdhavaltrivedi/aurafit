/**
 * Pure helpers for server push reminders (no React Native / Expo imports, unit-tested in Node).
 * Native wiring lives in `lib/push.ts`, state in `hooks/useNotificationSettings.ts`.
 */
import { QUESTS_DEEP_LINK, type NotificationSettings } from '@aurafit/shared';
import type { ReminderSettings } from './reminders';

export type PushStatus =
  /** Not checked yet / not signed in. */
  | 'idle'
  /** This build or device cannot receive remote push (see `pushUnsupportedReason`). */
  | 'unsupported'
  /** Supported, but the user has not opted in on this device yet. */
  | 'off'
  /** Notification permission was refused. */
  | 'denied'
  | 'registering'
  /** The token is registered with the server for this account. */
  | 'registered'
  | 'error';

export interface PushEnvironment {
  isDevice: boolean;
  /** Running inside the Expo Go app (not a development/production build). */
  isExpoGo: boolean;
  os: string;
  projectId: string | null | undefined;
}

/** Why remote push cannot work here, or null when it can. */
export function pushUnsupportedReason(env: PushEnvironment): string | null {
  if (env.os !== 'ios' && env.os !== 'android') return 'Push reminders are only available in the iOS and Android apps.';
  if (!env.isDevice) return 'Push reminders need a physical device (simulators cannot get a push token).';
  if (env.isExpoGo && env.os === 'android') {
    return 'Expo Go on Android cannot receive push notifications. Use a development or store build.';
  }
  if (!env.projectId) return 'Push is not configured for this build (missing EAS project id).';
  return null;
}

/** True when the settings ask for at least one server push. */
export function wantsPush(s: NotificationSettings | null | undefined): boolean {
  return !!s && (s.streakSaver || s.dailyReminderHour !== null);
}

/**
 * The local daily reminder is the offline fallback. When the server will push the daily
 * reminder to this device, the local one is cancelled so the user is not reminded twice.
 */
export function shouldSuppressLocalReminder(push: PushStatus, settings: NotificationSettings | null | undefined): boolean {
  return push === 'registered' && !!settings && settings.dailyReminderHour !== null;
}

/**
 * Local reminder adjusted to match the server's daily reminder (set on the web, during
 * onboarding or on another device). Returns null when nothing needs to change.
 */
export function reminderFromServer(server: NotificationSettings, local: ReminderSettings): ReminderSettings | null {
  const h = server.dailyReminderHour;
  if (h === null) return local.enabled ? { ...local, enabled: false } : null;
  if (local.enabled && local.hour === h && local.minute === 0) return null;
  return { enabled: true, hour: h, minute: 0 };
}

/** Server value for a local reminder change (server reminders are on the hour). */
export function dailyHourFromReminder(r: ReminderSettings): number | null {
  return r.enabled ? r.hour : null;
}

/** Where a tapped notification should take the user. */
export function routeForNotificationData(data: unknown): 'quests' | null {
  if (!data || typeof data !== 'object') return null;
  const url = (data as Record<string, unknown>).url;
  if (typeof url !== 'string') return null;
  const normalized = url.trim().replace(/\/+$/, '').toLowerCase();
  return normalized === QUESTS_DEEP_LINK || normalized === 'aurafit:///quests' ? 'quests' : null;
}

/** Resolves with the promise's value, or `fallback` after `ms`. Never rejects. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export interface StoredPushState {
  /** The user turned push reminders on from this device (permission prompt shown by an action). */
  optedIn: boolean;
  /** Last Expo token registered with the server from this device. */
  token: string | null;
}

export const PUSH_STORAGE_PREFIX = 'aurafit:push:v1:';

export function parseStoredPush(raw: string | null): StoredPushState {
  try {
    const p = raw ? (JSON.parse(raw) as Partial<StoredPushState>) : {};
    return { optedIn: p.optedIn === true, token: typeof p.token === 'string' ? p.token : null };
  } catch {
    return { optedIn: false, token: null };
  }
}
