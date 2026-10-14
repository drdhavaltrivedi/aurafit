// ==========================================
// STREAK-SAVER PUSH NOTIFICATIONS — shared contract
// Implemented by apps/web/src/app/api/v1/me/{notification-settings,push-tokens}
// and apps/web/src/app/api/cron/notifications; consumed by web /account, the Expo
// app and onboarding (which calls PUT notification-settings in its reminder step).
// ==========================================

export const NOTIFICATION_ROUTES = {
  /**
   * GET (auth) → NotificationSettings (defaults when never saved).
   * PUT (auth) NotificationSettings → NotificationSettings (full replace; unknown keys ignored).
   */
  settings: '/api/v1/me/notification-settings',
  /**
   * POST (auth) RegisterPushTokenRequest → 204 (idempotent; re-registering refreshes last_seen_at).
   * DELETE (auth) UnregisterPushTokenRequest → 204 (idempotent; only the caller's own token is removed).
   */
  pushTokens: '/api/v1/me/push-tokens',
  /** POST, `Authorization: Bearer <CRON_SECRET>`. Called hourly by Supabase pg_cron + pg_net. */
  cron: '/api/cron/notifications',
} as const;

export type NotificationKind = 'STREAK_SAVER' | 'DAILY_REMINDER';
export const NOTIFICATION_KINDS: readonly NotificationKind[] = ['STREAK_SAVER', 'DAILY_REMINDER'];

/** Body and response of GET/PUT /api/v1/me/notification-settings. */
export interface NotificationSettings {
  /** IANA time zone, e.g. "Europe/London". Validated with Intl on the server. */
  timezone: string;
  /** Push at 20:00 local time when the streak is alive but not yet extended today. */
  streakSaver: boolean;
  /** 0-23 local hour for the daily push reminder, or null for none. */
  dailyReminderHour: number | null;
}

export type UpdateNotificationSettingsRequest = NotificationSettings;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  timezone: 'UTC',
  streakSaver: true,
  dailyReminderHour: null,
};

/** Local hour (0-23) at which the streak saver push is sent. */
export const STREAK_SAVER_LOCAL_HOUR = 20;

export type PushPlatform = 'ios' | 'android';

/** POST /api/v1/me/push-tokens */
export interface RegisterPushTokenRequest {
  /** Expo push token: `ExponentPushToken[...]` (or the newer `ExpoPushToken[...]`). */
  token: string;
  platform: PushPlatform;
}

/** DELETE /api/v1/me/push-tokens */
export interface UnregisterPushTokenRequest {
  token: string;
}

/** Response of the cron route (operational counters only, no personal data). */
export interface NotificationCronResponse {
  ranAt: string;
  kinds: Record<NotificationKind, { claimed: number; sent: number; failed: number }>;
  messages: number;
  tickets: { ok: number; error: number };
  receiptsChecked: number;
  tokensRemoved: number;
}

/** Deep link opened when a reminder push is tapped. */
export const QUESTS_DEEP_LINK = 'aurafit://quests';

export const MAX_PUSH_TOKEN_LENGTH = 200;
const PUSH_TOKEN_RE = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{1,180}\]$/;

export function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_PUSH_TOKEN_LENGTH && PUSH_TOKEN_RE.test(value);
}

const TZ_SHAPE = /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/;

/**
 * True for an IANA zone name that this runtime's Intl knows ("UTC" included).
 * Postgres re-checks against pg_timezone_names, so a zone unknown to either side is
 * never used for scheduling.
 */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !TZ_SHAPE.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** The device / browser time zone, or 'UTC' when it cannot be determined. */
export function detectTimeZone(): string {
  try {
    const tz = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; fieldErrors: Record<string, string> };

/** Validates a PUT notification-settings body (all three fields required; extra keys ignored). */
export function validateNotificationSettings(input: unknown): ValidationResult<NotificationSettings> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, fieldErrors: { body: 'Body must be a JSON object.' } };
  }
  const o = input as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};
  if (!isValidTimeZone(o.timezone)) fieldErrors.timezone = 'timezone must be a valid IANA time zone (e.g. "Europe/London").';
  if (typeof o.streakSaver !== 'boolean') fieldErrors.streakSaver = 'streakSaver must be true or false.';
  const h = o.dailyReminderHour;
  if (!(h === null || (typeof h === 'number' && Number.isInteger(h) && h >= 0 && h <= 23))) {
    fieldErrors.dailyReminderHour = 'dailyReminderHour must be an integer from 0 to 23, or null.';
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return {
    ok: true,
    value: { timezone: o.timezone as string, streakSaver: o.streakSaver as boolean, dailyReminderHour: h as number | null },
  };
}

export function validateRegisterPushToken(input: unknown): ValidationResult<RegisterPushTokenRequest> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, fieldErrors: { body: 'Body must be a JSON object.' } };
  }
  const o = input as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};
  if (!isExpoPushToken(o.token)) fieldErrors.token = 'token must be an Expo push token (ExponentPushToken[...]).';
  if (o.platform !== 'ios' && o.platform !== 'android') fieldErrors.platform = 'platform must be "ios" or "android".';
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return { ok: true, value: { token: o.token as string, platform: o.platform as PushPlatform } };
}

export function validateUnregisterPushToken(input: unknown): ValidationResult<UnregisterPushTokenRequest> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, fieldErrors: { body: 'Body must be a JSON object.' } };
  }
  const token = (input as Record<string, unknown>).token;
  if (!isExpoPushToken(token)) return { ok: false, fieldErrors: { token: 'token must be an Expo push token (ExponentPushToken[...]).' } };
  return { ok: true, value: { token } };
}

export interface PushContent {
  title: string;
  body: string;
  data: { url: string; kind: NotificationKind };
}

/** Copy for each reminder kind. */
export function notificationContent(kind: NotificationKind, streakDays = 0): PushContent {
  if (kind === 'STREAK_SAVER') {
    const n = Math.max(1, Math.floor(streakDays));
    return {
      title: 'Streak in danger',
      body: `Your ${n}-day streak ends at midnight. A 5-minute quest keeps it alive.`,
      data: { url: QUESTS_DEEP_LINK, kind },
    };
  }
  return {
    title: 'AuraFit',
    body: "Time to level up. Today's quests are waiting.",
    data: { url: QUESTS_DEEP_LINK, kind },
  };
}

/** "6 PM" style label for an hour (0-23). */
export function formatHourLabel(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? 'AM' : 'PM'}`;
}
