import { NOTIFICATION_ROUTES, type NotificationSettings } from '@aurafit/shared';
import { apiFetch } from '@/lib/api-client';

/** Browser helpers for the notification settings endpoints (cookie session). Never throw. */
export const notificationsApi = {
  getSettings: () => apiFetch<NotificationSettings>(NOTIFICATION_ROUTES.settings),
  saveSettings: (settings: NotificationSettings) =>
    apiFetch<NotificationSettings>(NOTIFICATION_ROUTES.settings, { method: 'PUT', body: JSON.stringify(settings) }),
};
