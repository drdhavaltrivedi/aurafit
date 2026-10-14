import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { routeForNotificationData } from '../lib/notificationPrefs';

/**
 * Routes notification taps (server push or the local reminder) with `data.url` =
 * aurafit://quests to the Quests tab, both while running and from a cold start.
 */
export function useNotificationRouting(onOpenQuests: () => void): void {
  const cb = useRef(onOpenQuests);
  cb.current = onOpenQuests;

  useEffect(() => {
    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      if (routeForNotificationData(response.notification.request.content.data) === 'quests') {
        cb.current();
        // Consumed: do not route again when the shell remounts.
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
      }
    };
    // Cold start: the tap that launched the app.
    Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, []);
}
