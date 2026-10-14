/**
 * Server notification settings + this device's push registration, as one app-wide store
 * (module state + useSyncExternalStore) so the Notifications and Settings screens, the local
 * reminder and the shell all see the same values.
 *
 * Lifecycle: `usePushRegistration(profileId)` (mounted by the signed-in shell) attaches the
 * store to an account: GET settings, keep the timezone current, and, only if a reminder is on
 * AND notification permission was already granted, silently register/refresh the token. The OS
 * permission prompt appears only from `enablePush()`, i.e. when the user turns a reminder on.
 */
import { useSyncExternalStore } from 'react';
import { Linking } from 'react-native';
import { DEFAULT_NOTIFICATION_SETTINGS, detectTimeZone, type NotificationSettings } from '@aurafit/shared';
import { notificationsApi } from '../api/notifications';
import { wantsPush, type PushStatus, type StoredPushState } from '../lib/notificationPrefs';
import {
  getExpoPushToken,
  getPushPermission,
  getPushUnsupportedReason,
  loadPushState,
  pushPlatform,
  requestPushPermission,
  savePushState,
} from '../lib/push';
import { errorMessage } from './useApi';

export interface NotificationState {
  /** Signed-in profile the store is attached to (null in demo / signed out). */
  profileId: string | null;
  /** Server settings (null until loaded). */
  settings: NotificationSettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  push: PushStatus;
  /** Explanation for unsupported / denied / error push states. */
  pushMessage: string | null;
}

const INITIAL: NotificationState = {
  profileId: null,
  settings: null,
  loading: false,
  saving: false,
  error: null,
  push: 'idle',
  pushMessage: null,
};

let state: NotificationState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<NotificationState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => state;

export function getNotificationState(): NotificationState {
  return state;
}
export const subscribeNotificationState = subscribe;

const DENIED_MESSAGE = 'Notifications are turned off for AuraFit. Allow them in Settings to get push reminders.';
const REGISTER_FAILED = "Couldn't set up push reminders on this device. We'll retry next time you open the app.";

async function registerCurrentToken(profileId: string, stored: StoredPushState): Promise<boolean> {
  const platform = pushPlatform();
  if (!platform) return false;
  set({ push: 'registering', pushMessage: null });
  try {
    const token = await getExpoPushToken();
    await notificationsApi.registerToken(token, platform);
    if (stored.token && stored.token !== token) notificationsApi.unregisterToken(stored.token).catch(() => {});
    await savePushState(profileId, { optedIn: true, token });
    if (state.profileId === profileId) set({ push: 'registered', pushMessage: null });
    return true;
  } catch {
    if (state.profileId === profileId) set({ push: 'error', pushMessage: REGISTER_FAILED });
    return false;
  }
}

/**
 * Registers without prompting: only when the settings want push AND notification permission was
 * already granted by an earlier user action (a reminder toggle here, onboarding's reminder step,
 * or the local reminder). Never shows the OS prompt.
 */
async function silentRegister(profileId: string): Promise<void> {
  const stored = await loadPushState(profileId);
  if (state.profileId !== profileId) return;
  if (!wantsPush(state.settings)) {
    set({ push: 'off' });
    return;
  }
  const perm = await getPushPermission();
  if (state.profileId !== profileId) return;
  if (perm !== 'granted') {
    set({ push: perm === 'denied' ? 'denied' : 'off', pushMessage: perm === 'denied' ? DENIED_MESSAGE : null });
    return;
  }
  await registerCurrentToken(profileId, stored);
}

export async function attachNotifications(profileId: string): Promise<void> {
  if (state.profileId === profileId) return;
  set({ ...INITIAL, profileId, loading: true });
  const unsupported = getPushUnsupportedReason();
  let settings: NotificationSettings;
  try {
    settings = await notificationsApi.getSettings();
  } catch (err) {
    if (state.profileId !== profileId) return;
    set({
      loading: false,
      error: errorMessage(err),
      push: unsupported ? 'unsupported' : 'off',
      pushMessage: unsupported,
    });
    return;
  }
  if (state.profileId !== profileId) return;
  set({ settings, loading: false });

  // Keep the server's timezone in step with the device (travel, DST zone changes).
  const tz = detectTimeZone();
  if (settings.timezone !== tz) {
    try {
      const saved = await notificationsApi.saveSettings({ ...settings, timezone: tz });
      if (state.profileId === profileId) set({ settings: saved });
    } catch {
      /* retried on next launch */
    }
  }

  if (unsupported) {
    set({ push: 'unsupported', pushMessage: unsupported });
    return;
  }
  await silentRegister(profileId);
}

export function detachNotifications(profileId: string): void {
  if (state.profileId === profileId) set(INITIAL);
}

/** Called when the OS rotates the push token: register the new one, drop the old one. */
export async function refreshPushToken(profileId: string): Promise<void> {
  if (state.profileId !== profileId || state.push !== 'registered') return;
  await registerCurrentToken(profileId, await loadPushState(profileId));
}

/** Removes this device's token from the server (sign-out). Keeps the opt-in for next sign-in. */
export async function unregisterPushForSignOut(profileId: string): Promise<void> {
  const stored = await loadPushState(profileId);
  if (!stored.token) return;
  await notificationsApi.unregisterToken(stored.token);
  await savePushState(profileId, { ...stored, token: null });
}

/** PUTs the full settings (current device timezone) with `patch` applied. */
export async function saveNotificationSettings(patch: Partial<Omit<NotificationSettings, 'timezone'>>): Promise<boolean> {
  const profileId = state.profileId;
  if (!profileId) return false;
  const next: NotificationSettings = { ...(state.settings ?? DEFAULT_NOTIFICATION_SETTINGS), ...patch, timezone: detectTimeZone() };
  set({ saving: true, error: null, settings: next });
  try {
    const saved = await notificationsApi.saveSettings(next);
    if (state.profileId === profileId) set({ settings: saved, saving: false });
    return true;
  } catch (err) {
    if (state.profileId === profileId) set({ saving: false, error: errorMessage(err) });
    return false;
  }
}

/**
 * Opt-in action: asks for permission (user just turned a reminder on), registers the token and
 * makes sure the server has a settings row with this device's timezone.
 */
export async function enablePush(): Promise<boolean> {
  const profileId = state.profileId;
  if (!profileId) return false;
  const unsupported = getPushUnsupportedReason();
  if (unsupported) {
    set({ push: 'unsupported', pushMessage: unsupported });
    return false;
  }
  if (state.push === 'registered') return true;
  const perm = await requestPushPermission();
  if (state.profileId !== profileId) return false;
  if (perm !== 'granted') {
    set({ push: 'denied', pushMessage: DENIED_MESSAGE });
    return false;
  }
  const ok = await registerCurrentToken(profileId, { ...(await loadPushState(profileId)), optedIn: true });
  if (ok) await saveNotificationSettings({});
  return ok;
}

async function setStreakSaver(on: boolean): Promise<void> {
  const saved = await saveNotificationSettings({ streakSaver: on });
  if (saved && on) await enablePush();
}

/** Server daily reminder hour (null = off). Called by the local reminder when it changes. */
export async function setDailyReminderHour(hour: number | null): Promise<void> {
  const saved = await saveNotificationSettings({ dailyReminderHour: hour });
  if (saved && hour !== null && state.push !== 'registered' && state.push !== 'unsupported') await enablePush();
}

export interface NotificationStore extends NotificationState {
  setStreakSaver: (on: boolean) => Promise<void>;
  enablePush: () => Promise<boolean>;
  openSettings: () => void;
}

const openSettings = () => {
  Linking.openSettings().catch(() => {});
};

export function useNotificationSettings(): NotificationStore {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...s, setStreakSaver, enablePush, openSettings };
}
