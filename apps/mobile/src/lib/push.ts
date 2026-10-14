/**
 * Native side of server push reminders: support detection, permission, Expo push token, and
 * per-account opt-in storage. Never asks for permission on its own; `requestPushPermission` is
 * only called from an explicit user action (turning a reminder on).
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { isRunningInExpoGo } from 'expo';
import type { PushPlatform } from '@aurafit/shared';
import {
  PUSH_STORAGE_PREFIX,
  parseStoredPush,
  pushUnsupportedReason,
  type StoredPushState,
} from './notificationPrefs';

/** Same channel as the local reminder (hooks/useReminder.ts) and the server (`channelId`). */
export const REMINDER_CHANNEL_ID = 'reminders';

export function easProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

/** Null when this build/device can receive remote push; otherwise a user-facing reason. */
export function getPushUnsupportedReason(): string | null {
  let expoGo = false;
  try {
    expoGo = isRunningInExpoGo();
  } catch {
    expoGo = false;
  }
  return pushUnsupportedReason({ isDevice: Device.isDevice, isExpoGo: expoGo, os: Platform.OS, projectId: easProjectId() });
}

export function pushPlatform(): PushPlatform | null {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null;
}

/** Android 13+ only shows the permission prompt once a channel exists. */
export async function ensureReminderChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Workout reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function getPushPermission(): Promise<PermissionState> {
  const p = await Notifications.getPermissionsAsync().catch(() => null);
  if (p?.granted) return 'granted';
  return p?.canAskAgain === false || p?.status === 'denied' ? 'denied' : 'undetermined';
}

/** Asks the OS for permission. Call ONLY from a user action. */
export async function requestPushPermission(): Promise<PermissionState> {
  await ensureReminderChannel().catch(() => {});
  const current = await getPushPermission();
  if (current !== 'undetermined') return current;
  const p = await Notifications.requestPermissionsAsync().catch(() => null);
  return p?.granted ? 'granted' : 'denied';
}

/** The Expo push token (ExponentPushToken[...]). Throws when the service is unreachable. */
export async function getExpoPushToken(): Promise<string> {
  const projectId = easProjectId();
  if (!projectId) throw new Error('Missing EAS projectId');
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

const storageKey = (profileId: string) => `${PUSH_STORAGE_PREFIX}${profileId}`;

export async function loadPushState(profileId: string): Promise<StoredPushState> {
  return parseStoredPush(await AsyncStorage.getItem(storageKey(profileId)).catch(() => null));
}

export async function savePushState(profileId: string, state: StoredPushState): Promise<void> {
  await AsyncStorage.setItem(storageKey(profileId), JSON.stringify(state)).catch(() => {});
}
