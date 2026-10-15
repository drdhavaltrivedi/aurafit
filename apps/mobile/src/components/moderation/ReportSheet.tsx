import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MODERATION_NOTE_MAX_LENGTH, type ReportReason, type ReportTargetType } from '@aurafit/shared';
import { AppButton } from '../AppButton';
import { FormMessage } from '../AuthLayout';
import { TextField } from '../TextField';
import { REPORT_REASON_OPTIONS, isSuspendedError, notifySuspended, reportOutcome } from '../../lib/moderation';
import { moderationApi } from '../../hooks/useModeration';
import { useTheme } from '../../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, radius, spacing } from '../../theme/tokens';
import { Sheet } from './Sheet';

export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  /** Shown in the sheet ("Night Shift [NIGHT]", a drop title...). */
  label: string;
}

interface Props {
  /** null = closed. */
  target: ReportTarget | null;
  onClose: () => void;
  /** Called with the toast text when the report went through (or was already filed). */
  onDone: (text: string) => void;
}

/** Report a workout drop or squad: reason + optional note. Reporters stay anonymous. */
export function ReportSheet({ target, onClose, onDone }: Props) {
  const { colors } = useTheme();
  const [reason, setReason] = useState<ReportReason>('SPAM');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setReason('SPAM');
    setNote('');
    setError(null);
    setBusy(false);
  }, [target]);

  const submit = async () => {
    if (!target || busy || !moderationApi) return;
    setBusy(true);
    setError(null);
    let failure: unknown | null = null;
    try {
      await moderationApi.report({ targetType: target.type, targetId: target.id, reason, note });
    } catch (err) {
      failure = err;
    }
    setBusy(false);
    const outcome = reportOutcome(failure);
    if (isSuspendedError(failure)) notifySuspended(outcome.text);
    if (outcome.done) {
      onClose();
      onDone(outcome.text);
    } else setError(outcome.text);
  };

  return (
    <Sheet
      visible={!!target}
      onClose={onClose}
      title={target?.type === 'SQUAD' ? 'Report squad' : 'Report workout'}
      description={target ? `${target.label}. Your report is anonymous.` : undefined}
      testID="report-sheet"
    >
      {error ? <FormMessage tone="error" message={error} /> : null}
      <Text style={[styles.label, { color: colors.textSecondary }]} accessibilityRole="header">
        What&apos;s wrong?
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Report reason" style={styles.options}>
        {REPORT_REASON_OPTIONS.map((o) => {
          const on = o.value === reason;
          return (
            <Pressable
              key={o.value}
              testID={`report-reason-${o.value}`}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ checked: on }}
              onPress={() => setReason(o.value)}
              style={[
                styles.option,
                { borderColor: on ? colors.borderFocus : colors.border, backgroundColor: on ? colors.primarySubtle : colors.bgInput },
              ]}
            >
              <View style={[styles.radio, { borderColor: on ? colors.primary : colors.textMuted }]}>
                {on ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
              </View>
              <Text style={[styles.optionText, { color: colors.textPrimary }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextField
        label="Details (optional)"
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={MODERATION_NOTE_MAX_LENGTH}
        hint={`${note.length}/${MODERATION_NOTE_MAX_LENGTH}`}
        inputStyle={styles.note}
        testID="report-note"
      />
      <AppButton label="Send report" variant="danger" loading={busy} onPress={() => void submit()} testID="report-submit" />
      <AppButton label="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: fontSize.caption + 1,
    fontWeight: '700',
  },
  options: {
    gap: spacing.sm,
  },
  option: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optionText: {
    flex: 1,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
  note: {
    minHeight: 88,
    paddingTop: spacing.sm,
    textAlignVertical: 'top',
  },
});
