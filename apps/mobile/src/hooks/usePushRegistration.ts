import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { shouldSuppressLocalReminder } from '../lib/notificationPrefs';
import { addSignOutTask } from '../lib/signOutTasks';
import {
  attachNotifications,
  detachNotifications,
  getNotificationState,
  refreshPushToken,
  subscribeNotificationState,
  unregisterPushForSignOut,
} from './useNotificationSettings';
import { reconcileLocalReminder } from './useReminder';

/**
 * Mount once in the signed-in shell (`profileId` = profiles.id; null in demo mode).
 * Loads the server settings, silently refreshes this device's token if the user opted in before
 * (never prompts on launch), follows token rotation, removes the token on sign-out, and keeps
 * the local reminder cancelled while server push covers it.
 */
export function usePushRegistration(profileId: string | null): void {
  useEffect(() => {
    if (!profileId) return;
    void attachNotifications(profileId);

    const tokenSub = Notifications.addPushTokenListener(() => {
      void refreshPushToken(profileId);
    });
    const removeTask = addSignOutTask(() => unregisterPushForSignOut(profileId));

    let suppressed: boolean | null = null;
    const unsubscribe = subscribeNotificationState(() => {
      const s = getNotificationState();
      if (s.profileId !== profileId || s.push === 'idle' || s.push === 'registering') return;
      const next = shouldSuppressLocalReminder(s.push, s.settings);
      if (next !== suppressed) {
        suppressed = next;
        void reconcileLocalReminder(next);
      }
    });

    return () => {
      tokenSub.remove();
      removeTask();
      unsubscribe();
      detachNotifications(profileId);
    };
  }, [profileId]);
}
