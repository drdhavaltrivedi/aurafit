import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityState,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { LucideIcon } from './icons';
import { useTheme } from '../theme/ThemeProvider';
import { AppIcon } from './AppIcon';
import { MIN_TOUCH_TARGET, fontSize, radius, spacing } from '../theme/tokens';

type Variant = 'primary' | 'success' | 'secondary' | 'ghost' | 'danger';

/** Destructive fill; white text on it is ~6:1 in both themes. */
const DANGER_FILL = '#B91C1C';

export interface AppButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  /** Spoken label when the visible label is not descriptive enough on its own. */
  accessibilityLabel?: string;
  variant?: Variant;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  selected?: boolean;
  /** Shows a spinner, disables presses and marks the button busy for screen readers. */
  loading?: boolean;
  /** Optional decorative icon shown before the label (uses the label colour). */
  icon?: LucideIcon;
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export function AppButton({
  label,
  variant = 'primary',
  size = 'md',
  style,
  disabled,
  selected,
  loading = false,
  accessibilityLabel,
  accessibilityHint,
  icon,
  ...rest
}: AppButtonProps) {
  const { colors } = useTheme();

  const bg: Record<Variant, string> = {
    primary: colors.primaryStrong,
    success: colors.emeraldStrong,
    secondary: colors.bgElevated,
    ghost: 'transparent',
    danger: DANGER_FILL,
  };
  const fg: Record<Variant, string> = {
    primary: colors.onPrimary,
    success: '#FFFFFF',
    secondary: colors.textPrimary,
    ghost: colors.textSecondary,
    danger: '#FFFFFF',
  };

  const isDisabled = !!disabled || loading;
  const a11yState: AccessibilityState = { disabled: isDisabled, busy: loading };
  if (selected !== undefined) a11yState.selected = selected;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={a11yState}
      disabled={isDisabled}
      hitSlop={HIT_SLOP}
      android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: false }}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' && styles.lg,
        {
          backgroundColor: bg[variant],
          borderColor: variant === 'secondary' ? colors.border : 'transparent',
          opacity: isDisabled && !loading ? 0.45 : pressed ? 0.8 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.97 : 1 }],
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} accessibilityElementsHidden importantForAccessibility="no" />
      ) : (
        <View style={styles.content}>
          {icon ? (
            <AppIcon
              icon={icon}
              size={size === 'lg' ? fontSize.bodyLg + 3 : fontSize.body + 2}
              color={fg[variant]}
              strokeWidth={2.5}
            />
          ) : null}
          <Text
            style={[styles.label, size === 'lg' && styles.labelLg, { color: fg[variant] }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.6}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lg: {
    minHeight: 52,
    paddingHorizontal: spacing.xl,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  label: {
    flexShrink: 1,
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  labelLg: {
    fontSize: fontSize.bodyLg,
    fontWeight: '900',
  },
});
