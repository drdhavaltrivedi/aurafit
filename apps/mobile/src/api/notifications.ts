/** Notification endpoints of the AuraFit API (`/api/v1/me/notification-settings`, `/api/v1/me/push-tokens`). */
import {
  NOTIFICATION_ROUTES,
  type NotificationSettings,
  type PushPlatform,
  type RegisterPushTokenRequest,
  type UnregisterPushTokenRequest,
} from '@aurafit/shared';
import { api } from './index';

function client() {
  if (!api) throw new Error('The AuraFit API is not configured (demo mode).');
  return api;
}

export const notificationsApi = {
  getSettings: () => client().request<NotificationSettings>(NOTIFICATION_ROUTES.settings),
  saveSettings: (settings: NotificationSettings) =>
    client().request<NotificationSettings>(NOTIFICATION_ROUTES.settings, { method: 'PUT', body: settings }),
  registerToken: (token: string, platform: PushPlatform) =>
    client().request<void>(NOTIFICATION_ROUTES.pushTokens, {
      method: 'POST',
      body: { token, platform } satisfies RegisterPushTokenRequest,
    }),
  unregisterToken: (token: string) =>
    client().request<void>(NOTIFICATION_ROUTES.pushTokens, {
      method: 'DELETE',
      body: { token } satisfies UnregisterPushTokenRequest,
    }),
};
