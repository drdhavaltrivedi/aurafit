import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../components/AppIcon';
import { ProgressBar } from '../../components/ProgressBar';
import type { LucideIcon } from '../../components/icons';
import { useTheme } from '../../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, radius, spacing } from '../../theme/tokens';

/** Selectable card (one option of a radio group). */
export function ChoiceCard({
  label,
  description,
  icon,
  selected,
  onPress,
  testID,
  compact,
}: {
  label: string;
  description?: string;
  icon: LucideIcon;
  selected: boolean;
  onPress: () => void;
  testID?: string;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      style={({ pressed }) => [
        styles.choice,
        compact && styles.choiceCompact,
        {
          backgroundColor: selected ? colors.primarySubtle : colors.bgElevated,
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 2 : 1,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={[styles.choiceIcon, { backgroundColor: colors.primarySubtle }]}>
        <AppIcon icon={icon} size={compact ? 18 : 22} color={colors.primary} />
      </View>
      <View style={styles.choiceText}>
        <Text style={[styles.choiceLabel, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.6}>
          {label}
        </Text>
        {description ? (
          <Text style={[styles.choiceDescription, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.6}>
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function StepHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow.toUpperCase()}</Text>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.5}>
        {title}
      </Text>
      {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
    </View>
  );
}

export function StepProgress({ step, total, label }: { step: number; total: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.progress}>
      <Text style={[styles.progressText, { color: colors.textSecondary }]} testID="onboarding-progress">
        Step {step} of {total}
      </Text>
      <ProgressBar value={(step / total) * 100} label={`Step ${step} of ${total}: ${label}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET + 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  choiceCompact: {
    minHeight: MIN_TOUCH_TARGET + 4,
    paddingVertical: spacing.sm,
  },
  choiceIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: {
    flex: 1,
    gap: 2,
  },
  choiceLabel: {
    fontSize: fontSize.bodyLg,
    fontWeight: '800',
  },
  choiceDescription: {
    fontSize: fontSize.body - 1,
  },
  header: {
    gap: spacing.xs,
  },
  eyebrow: {
    fontSize: fontSize.caption,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    fontSize: fontSize.headline + 4,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: fontSize.body,
    lineHeight: 20,
  },
  progress: {
    gap: spacing.xs + 2,
  },
  progressText: {
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
});
