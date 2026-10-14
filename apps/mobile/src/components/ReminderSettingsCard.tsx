import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Clock, Minus, Plus } from './icons';
import { AppButton } from './AppButton';
import { AppIcon } from './AppIcon';
import { FormMessage } from './AuthLayout';
import type { ReminderStore } from '../hooks/useReminder';
import { REMINDER_MINUTE_STEP, formatReminderTime, shiftTime } from '../lib/reminders';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, radius, spacing } from '../theme/tokens';

/** "Daily workout reminder" switch + time stepper (local notification). */
export function ReminderSettingsCard({ reminder }: { reminder: ReminderStore }) {
  const { colors, isDark } = useTheme();
  const { settings, loaded, busy, error, permission } = reminder;
  const time = formatReminderTime(settings.hour, settings.minute);

  const step = (delta: number) => {
    const next = shiftTime(settings, delta);
    void reminder.setTime(next.hour, next.minute);
  };

  const stepBtn = (icon: typeof Plus, delta: number, label: string, testID: string) => (
    <Pressable
      onPress={() => step(delta)}
      disabled={busy}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.stepBtn,
        { backgroundColor: colors.bgElevated, borderColor: colors.border, opacity: busy ? 0.5 : pressed ? 0.7 : 1 },
      ]}
    >
      <AppIcon icon={icon} size={18} color={colors.textPrimary} strokeWidth={2.5} />
    </Pressable>
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={styles.textCol}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Daily workout reminder</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {settings.enabled ? `On — every day at ${time}` : 'A gentle nudge to train, once a day.'}
          </Text>
        </View>
        {loaded ? (
          <Switch
            testID="reminder-switch"
            value={settings.enabled}
            disabled={busy}
            onValueChange={(v) => void reminder.setEnabled(v)}
            trackColor={{ true: colors.primaryStrong, false: isDark ? '#334155' : '#CBD5E1' }}
            ios_backgroundColor={isDark ? '#334155' : '#CBD5E1'}
            accessibilityLabel="Daily workout reminder"
          />
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>

      <View style={styles.row}>
        <View style={styles.timeLabel}>
          <AppIcon icon={Clock} size={16} color={colors.textSecondary} />
          <Text style={[styles.hint, { color: colors.textSecondary }]}>Reminder time</Text>
        </View>
        <View style={styles.stepper}>
          {stepBtn(Minus, -REMINDER_MINUTE_STEP, `Earlier, ${REMINDER_MINUTE_STEP} minutes`, 'reminder-earlier')}
          <Text
            testID="reminder-time"
            accessibilityLabel={`Reminder time ${time}`}
            style={[styles.time, { color: colors.textPrimary }]}
          >
            {time}
          </Text>
          {stepBtn(Plus, REMINDER_MINUTE_STEP, `Later, ${REMINDER_MINUTE_STEP} minutes`, 'reminder-later')}
        </View>
      </View>

      {error ? <FormMessage tone="error" message={error} /> : null}
      {permission === 'denied' ? (
        <AppButton label="Open Settings" variant="secondary" onPress={reminder.openSettings} testID="reminder-open-settings" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: fontSize.bodyLg,
    fontWeight: '800',
  },
  hint: {
    fontSize: fontSize.caption + 1,
  },
  timeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: {
    minWidth: 82,
    textAlign: 'center',
    fontSize: fontSize.bodyLg,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
});
