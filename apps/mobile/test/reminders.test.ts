import { describe, expect, it } from 'vitest';
import { DEFAULT_REMINDER, formatReminderTime, parseReminder, shiftTime } from '../src/lib/reminders';

describe('reminder settings', () => {
  it('parses defensively', () => {
    expect(parseReminder(null)).toEqual(DEFAULT_REMINDER);
    expect(parseReminder('{')).toEqual(DEFAULT_REMINDER);
    expect(parseReminder(JSON.stringify({ enabled: true, hour: 25, minute: -5 }))).toEqual({ enabled: true, hour: 1, minute: 55 });
  });

  it('shifts time and wraps around midnight', () => {
    expect(shiftTime({ enabled: false, hour: 23, minute: 45 }, 15)).toMatchObject({ hour: 0, minute: 0 });
    expect(shiftTime({ enabled: false, hour: 0, minute: 0 }, -15)).toMatchObject({ hour: 23, minute: 45 });
  });

  it('formats a 12-hour label', () => {
    expect(formatReminderTime(18, 0)).toBe('6:00 PM');
    expect(formatReminderTime(0, 5)).toBe('12:05 AM');
    expect(formatReminderTime(12, 30)).toBe('12:30 PM');
  });
});
