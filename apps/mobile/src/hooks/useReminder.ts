import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  DEFAULT_REMINDER,
  REMINDER_STORAGE_KEY,
  parseReminder,
  type ReminderSettings,
} from '../lib/reminders';

const REMINDER_ID = 'aurafit-daily-workout-reminder';
const CHANNEL_ID = 'reminders';

// Show reminders as a banner even when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Workout reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function schedule(s: ReminderSettings): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
  if (!s.enabled) return;
  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: 'Time to train, hunter',
      body: "Your daily quests are waiting. A quick session keeps your streak alive.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: s.hour,
      minute: s.minute,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
  });
}

export type ReminderPermission = 'granted' | 'denied' | 'undetermined';

export interface ReminderStore {
  settings: ReminderSettings;
  loaded: boolean;
  permission: ReminderPermission;
  busy: boolean;
  error: string | null;
  /** Turns the reminder on (asking for permission first) or off. */
  setEnabled: (enabled: boolean) => Promise<void>;
  setTime: (hour: number, minute: number) => Promise<void>;
  openSettings: () => void;
}

/** Daily workout reminder backed by a local scheduled notification (no push server involved). */
export function useReminder(): ReminderStore {
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDER);
  const [loaded, setLoaded] = useState(false);
  const [permission, setPermission] = useState<ReminderPermission>('undetermined');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

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
      await schedule(next);
      setSettings(next);
      await AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    } catch {
      setError("Couldn't update the reminder. Please try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        let perm = await Notifications.getPermissionsAsync().catch(() => null);
        if (!perm?.granted && perm?.canAskAgain !== false) {
          perm = await Notifications.requestPermissionsAsync().catch(() => null);
        }
        if (!perm?.granted) {
          setPermission('denied');
          setError('Notifications are turned off for AuraFit. Allow them in Settings to get reminders.');
          return;
        }
        setPermission('granted');
      }
      await apply({ ...settingsRef.current, enabled });
    },
    [apply]
  );

  const setTime = useCallback(
    async (hour: number, minute: number) => {
      const next = { ...settingsRef.current, hour, minute };
      if (next.enabled) await apply(next);
      else {
        setSettings(next);
        AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      }
    },
    [apply]
  );

  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  return { settings, loaded, permission, busy, error, setEnabled, setTime, openSettings };
}
