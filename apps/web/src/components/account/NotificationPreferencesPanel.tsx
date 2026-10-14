'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { BellRing } from 'lucide-react';
import {
  detectTimeZone,
  formatHourLabel,
  STREAK_SAVER_LOCAL_HOUR,
  type NotificationSettings,
} from '@aurafit/shared';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { notificationsApi } from '@/lib/notifications/client';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

type Status = { tone: 'success' | 'error'; text: string } | null;

/**
 * Reminder preferences shared with the mobile app (GET/PUT /api/v1/me/notification-settings).
 * The time zone is taken from this browser. Web push is not offered; pushes go to the app.
 */
export function NotificationPreferencesPanel() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [savedZone, setSavedZone] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [browserZone, setBrowserZone] = useState('UTC');

  useEffect(() => {
    const zone = detectTimeZone();
    setBrowserZone(zone);
    let active = true;
    notificationsApi.getSettings().then((res) => {
      if (!active) return;
      if (res.ok) {
        setSavedZone(res.data.timezone);
        setSettings({ ...res.data, timezone: zone });
      } else {
        setLoadError(res.message);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings || busy) return;
    setBusy(true);
    setStatus(null);
    const res = await notificationsApi.saveSettings(settings);
    setBusy(false);
    if (res.ok) {
      setSettings(res.data);
      setSavedZone(res.data.timezone);
      setStatus({ tone: 'success', text: 'Reminder preferences saved.' });
    } else {
      setStatus({ tone: 'error', text: res.message });
    }
  };

  return (
    <Card as="section" aria-labelledby="notification-prefs-title">
      <CardHeader
        titleId="notification-prefs-title"
        title="Reminders"
        subtitle="Push reminders arrive on the mobile app. Turn on notifications there to receive them."
      />

      {loadError ? (
        <p className="alert alert--error" role="alert">
          {loadError}
        </p>
      ) : !settings ? (
        <p className="text-sm text-secondary" role="status">
          Loading your reminder preferences…
        </p>
      ) : (
        <form className="stack-3" onSubmit={onSubmit} noValidate>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
            <input
              type="checkbox"
              checked={settings.streakSaver}
              onChange={(e) => setSettings({ ...settings, streakSaver: e.target.checked })}
              style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0 }}
              aria-describedby="streak-saver-hint"
            />
            <span className="stack-2" style={{ gap: 2 }}>
              <span className="field__label">Streak saver</span>
              <span id="streak-saver-hint" className="field__hint">
                At {formatHourLabel(STREAK_SAVER_LOCAL_HOUR)} your time, if your streak is still waiting on today&apos;s quest.
              </span>
            </span>
          </label>

          <div className="field">
            <label htmlFor="daily-reminder-hour" className="field__label">
              Daily reminder
            </label>
            <select
              id="daily-reminder-hour"
              className="input"
              value={settings.dailyReminderHour === null ? '' : String(settings.dailyReminderHour)}
              onChange={(e) => setSettings({ ...settings, dailyReminderHour: e.target.value === '' ? null : Number(e.target.value) })}
              aria-describedby="daily-reminder-hint"
            >
              <option value="">Off</option>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {formatHourLabel(h)}
                </option>
              ))}
            </select>
            <span id="daily-reminder-hint" className="field__hint">
              Skipped on days you have already trained.
            </span>
          </div>

          <p className="text-sm text-secondary">
            Time zone: <strong>{settings.timezone}</strong>
            {savedZone && savedZone !== browserZone ? ` (was ${savedZone}; saving updates it to this browser's zone)` : ' (from this browser)'}
          </p>

          {status ? (
            <p className={`alert alert--${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'}>
              {status.text}
            </p>
          ) : null}

          <div>
            <Button type="submit" variant="secondary" leadingIcon={<BellRing />} disabled={busy} aria-busy={busy}>
              {busy ? 'Saving…' : 'Save reminders'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
