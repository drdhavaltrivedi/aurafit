import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { QUESTS_DEEP_LINK } from '@aurafit/shared';
import {
  DEFAULT_REMINDER,
  REMINDER_MINUTE_STEP,
  REMINDER_STORAGE_KEY,
  parseReminder,
  type ReminderSettings,
} from '../lib/reminders';
import { dailyHourFromReminder, reminderFromServer, shouldSuppressLocalReminder } from '../lib/notificationPrefs';
import { REMINDER_CHANNEL_ID, ensureReminderChannel } from '../lib/push';
import { setDailyReminderHour, useNotificationSettings } from './useNotificationSettings';

const REMINDER_ID = 'aurafit-daily-workout-reminder';

// Show reminders as a banner even when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * (Re)schedules the local daily reminder. `suppress` cancels it while the server pushes the
 * daily reminder to this device, so the user is never reminded twice; the local reminder is the
 * offline fallback (demo mode, Expo Go on Android, simulators, push not set up).
 */
async function schedule(s: ReminderSettings, suppress = false): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
  if (!s.enabled || suppress) return;
  await ensureReminderChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: 'Time to train, hunter',
      body: "Your daily quests are waiting. A quick session keeps your streak alive.",
      data: { url: QUESTS_DEEP_LINK },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: s.hour,
      minute: s.minute,
      ...(Platform.OS === 'android' ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
  });
}

/** Applies the stored local reminder with/without suppression (used by the shell on push changes). */
export async function reconcileLocalReminder(suppress: boolean): Promise<void> {
  const s = parseReminder(await AsyncStorage.getItem(REMINDER_STORAGE_KEY).catch(() => null));
  if (!s.enabled) return;
  const perm = await Notifications.getPermissionsAsync().catch(() => null);
  if (!perm?.granted) return;
  await schedule(s, suppress).catch(() => {});
}

export type ReminderPermission = 'granted' | 'denied' | 'undetermined';

export interface ReminderStore {
  settings: ReminderSettings;
  loaded: boolean;
  permission: ReminderPermission;
  busy: boolean;
  error: string | null;
  /** Minutes per stepper tap: 60 when synced with server push (sent on the hour), else 15. */
  stepMinutes: number;
  /** True while the server push replaces the local notification on this device. */
  pushActive: boolean;
  /** Turns the reminder on (asking for permission first) or off. */
  setEnabled: (enabled: boolean) => Promise<void>;
  /**
   * Turns the reminder on at `hour:minute` (asks for permission: call from a user action, e.g.
   * the onboarding reminder step). Resolves false when notifications are not allowed.
   */
  enableAt: (hour: number, minute: number) => Promise<boolean>;
  setTime: (hour: number, minute: number) => Promise<void>;
  openSettings: () => void;
}

/**
 * Daily workout reminder. Signed in, it mirrors the server's `dailyReminderHour` (push from the
 * server when this device is registered; local notification otherwise). In demo mode it is a
 * purely local scheduled notification.
 */
export function useReminder(): ReminderStore {
  const notif = useNotificationSettings();
  const synced = notif.profileId !== null;
  const suppress = shouldSuppressLocalReminder(notif.push, notif.settings);

  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDER);
  const [loaded, setLoaded] = useState(false);
  const [permission, setPermission] = useState<ReminderPermission>('undetermined');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const suppressRef = useRef(suppress);
  suppressRef.current = suppress;

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(REMINDER_STORAGE_KEY).catch(() => null),
      Notifications.getPermissionsAsync().catch(() => null),
    ]).then(([raw, perm]) => {
      if (!active) return;
      let s = parseReminder(raw);
      const p: ReminderPermission = perm?.granted ? 'granted' : perm?.canAskAgain === false ? 'denied' : perm?.status === 'denied' ? 'denied' : 'undetermined';
      // Permission revoked in system settings since the reminder was enabled.
      if (s.enabled && p !== 'granted') s = { ...s, enabled: false };
      setPermission(p);
      setSettings(s);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const apply = useCallback(async (next: ReminderSettings) => {
    setBusy(true);
    setError(null);
    try {
      await schedule(next, suppressRef.current);
      setSettings(next);
      await AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    } catch {
      setError("Couldn't update the reminder. Please try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  // Cancel / restore the local notification when server push starts or stops covering it.
  useEffect(() => {
    if (loaded && settingsRef.current.enabled && permission === 'granted') {
      schedule(settingsRef.current, suppress).catch(() => {});
    }
  }, [loaded, suppress, permission]);

  // First server load for this account: adopt the server's hour (set on the web, in onboarding
  // or on another device); if the server has none but this device had a local reminder, upload it.
  const syncedFor = useRef<string | null>(null);
  const serverSettings = notif.settings;
  const profileId = notif.profileId;
  useEffect(() => {
    if (!loaded || !profileId || !serverSettings || syncedFor.current === profileId) return;
    syncedFor.current = profileId;
    const local = settingsRef.current;
    if (serverSettings.dailyReminderHour === null && local.enabled) {
      void setDailyReminderHour(local.hour);
      if (local.minute !== 0) void apply({ ...local, minute: 0 });
      return;
    }
    const next = reminderFromServer(serverSettings, local);
    if (next && (!next.enabled || permission === 'granted')) void apply(next);
  }, [loaded, profileId, serverSettings, permission, apply]);

  const turnOn = useCallback(
    async (enabled: boolean, time?: { hour: number; minute: number }): Promise<boolean> => {
      if (enabled) {
        let perm = await Notifications.getPermissionsAsync().catch(() => null);
        if (!perm?.granted && perm?.canAskAgain !== false) {
          await ensureReminderChannel().catch(() => {});
          perm = await Notifications.requestPermissionsAsync().catch(() => null);
        }
        if (!perm?.granted) {
          setPermission('denied');
          setError('Notifications are turned off for AuraFit. Allow them in Settings to get reminders.');
          return false;
        }
        setPermission('granted');
      }
      const next = { ...settingsRef.current, ...time, enabled, ...(synced ? { minute: 0 } : {}) };
      await apply(next);
      if (synced) await setDailyReminderHour(dailyHourFromReminder(next));
      return true;
    },
    [apply, synced]
  );

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      await turnOn(enabled);
    },
    [turnOn]
  );

  const enableAt = useCallback(
    (hour: number, minute: number) =>
      turnOn(true, { hour: ((Math.floor(hour) % 24) + 24) % 24, minute: ((Math.floor(minute) % 60) + 60) % 60 }),
    [turnOn]
  );

  const setTime = useCallback(
    async (hour: number, minute: number) => {
      const next = { ...settingsRef.current, hour, minute: synced ? 0 : minute };
      if (next.enabled) {
        await apply(next);
        if (synced) await setDailyReminderHour(next.hour);
      } else {
        setSettings(next);
        AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      }
    },
    [apply, synced]
  );

  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  return {
    settings,
    loaded,
    permission,
    busy: busy || notif.saving,
    error: error ?? notif.error,
    stepMinutes: synced ? 60 : REMINDER_MINUTE_STEP,
    pushActive: suppress,
    setEnabled,
    enableAt,
    setTime,
    openSettings,
  };
}
