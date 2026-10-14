/** Daily workout reminder settings (pure helpers; scheduling lives in `hooks/useReminder.ts`). */

export interface ReminderSettings {
  enabled: boolean;
  /** 0–23, local time. */
  hour: number;
  /** 0–59, local time. */
  minute: number;
}

export const REMINDER_STORAGE_KEY = 'aurafit:reminder:v1';
export const DEFAULT_REMINDER: ReminderSettings = { enabled: false, hour: 18, minute: 0 };
export const REMINDER_MINUTE_STEP = 15;

const wrap = (n: number, mod: number) => ((Math.round(n) % mod) + mod) % mod;

export function parseReminder(raw: string | null): ReminderSettings {
  if (!raw) return DEFAULT_REMINDER;
  try {
    const p = JSON.parse(raw) as Partial<ReminderSettings>;
    const hour = typeof p.hour === 'number' && Number.isFinite(p.hour) ? wrap(p.hour, 24) : DEFAULT_REMINDER.hour;
    const minute = typeof p.minute === 'number' && Number.isFinite(p.minute) ? wrap(p.minute, 60) : DEFAULT_REMINDER.minute;
    return { enabled: p.enabled === true, hour, minute };
  } catch {
    return DEFAULT_REMINDER;
  }
}

/** Moves the time by `deltaMinutes`, wrapping around midnight. */
export function shiftTime(s: ReminderSettings, deltaMinutes: number): ReminderSettings {
  const total = wrap(s.hour * 60 + s.minute + deltaMinutes, 24 * 60);
  return { ...s, hour: Math.floor(total / 60), minute: total % 60 };
}

/** "6:00 PM" style label (12-hour clock). */
export function formatReminderTime(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}
