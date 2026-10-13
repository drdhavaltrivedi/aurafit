import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type AccessibilityState,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, radius, spacing } from '../theme/tokens';

type Variant = 'primary' | 'success' | 'secondary' | 'ghost';

export interface AppButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  /** Spoken label when the visible label is not descriptive enough on its own. */
  accessibilityLabel?: string;
  variant?: Variant;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  selected?: boolean;
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export function AppButton({
  label,
  variant = 'primary',
  size = 'md',
  style,
  disabled,
  selected,
  accessibilityLabel,
  accessibilityHint,
  ...rest
}: AppButtonProps) {
  const { colors } = useTheme();

  const bg: Record<Variant, string> = {
    primary: colors.primaryStrong,
    success: colors.emeraldStrong,
    secondary: colors.bgElevated,
    ghost: 'transparent',
  };
  const fg: Record<Variant, string> = {
    primary: colors.onPrimary,
    success: '#FFFFFF',
    secondary: colors.textPrimary,
    ghost: colors.textSecondary,
  };

  const a11yState: AccessibilityState = { disabled: !!disabled };
  if (selected !== undefined) a11yState.selected = selected;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={a11yState}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: false }}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' && styles.lg,
        {
          backgroundColor: bg[variant],
          borderColor: variant === 'secondary' ? colors.border : 'transparent',
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
          transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
        },
        style,
      ]}
      {...rest}
    >
      <Text
        style={[styles.label, size === 'lg' && styles.labelLg, { color: fg[variant] }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.6}
      >
        {label}
      </Text>
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
  label: {
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  labelLg: {
    fontSize: fontSize.bodyLg,
    fontWeight: '900',
  },
});
