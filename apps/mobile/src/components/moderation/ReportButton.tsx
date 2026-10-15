import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { WorkoutDrop } from '@aurafit/shared';
import { Flag } from '../icons';
import { AppIcon } from '../AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, spacing } from '../../theme/tokens';
import { useModerationActions } from './ModerationProvider';

/** Low-emphasis "Report" action (flag icon; `compact` hides the text label). */
export function ReportButton({
  accessibilityLabel,
  onPress,
  compact = false,
  testID,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  compact?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      testID={testID}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}
    >
      <AppIcon icon={Flag} size={fontSize.caption + 3} color={colors.textSecondary} />
      {compact ? null : <Text style={[styles.text, { color: colors.textSecondary }]}>Report</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  text: {
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
});

/**
 * Drop-in Report action for any drop list: renders nothing in demo mode or on the viewer's own
 * drops, otherwise opens the report sheet. Usage: `<DropReportButton drop={drop} />`.
 */
export function DropReportButton({ drop, compact = false }: { drop: Pick<WorkoutDrop, 'id' | 'title' | 'creatorId'>; compact?: boolean }) {
  const moderation = useModerationActions();
  if (!moderation || !moderation.canReportDrop(drop)) return null;
  return (
    <ReportButton
      compact={compact}
      testID={`drop-report-${drop.id}`}
      accessibilityLabel={`Report workout: ${drop.title}`}
      onPress={() => moderation.reportDrop(drop)}
    />
  );
}
