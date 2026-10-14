import React, { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, radius, spacing } from '../theme/tokens';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  hint?: string;
  /** Extra input styles (e.g. height for multiline). */
  inputStyle?: StyleProp<TextStyle>;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, inputStyle, onFocus, onBlur, ...rest },
  ref
) {
  const { colors, isDark } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.pink : focused ? colors.borderFocus : colors.border;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        aria-invalid={!!error}
        placeholderTextColor={colors.textMuted}
        keyboardAppearance={isDark ? 'dark' : 'light'}
        selectionColor={colors.primary}
        maxFontSizeMultiplier={1.6}
        style={[styles.input, { backgroundColor: colors.bgInput, borderColor, color: colors.textPrimary }, inputStyle]}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
      {error ? (
        <Text
          style={[styles.error, { color: colors.pink }]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          maxFontSizeMultiplier={1.6}
        >
          {error}
        </Text>
      ) : hint ? (
        <Text style={[styles.hint, { color: colors.textMuted }]} maxFontSizeMultiplier={1.6}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs + 2,
  },
  label: {
    fontSize: fontSize.caption + 1,
    fontWeight: '700',
  },
  input: {
    minHeight: MIN_TOUCH_TARGET + 4,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 2,
    fontSize: fontSize.bodyLg,
  },
  error: {
    fontSize: fontSize.caption + 1,
    fontWeight: '600',
  },
  hint: {
    fontSize: fontSize.caption,
  },
});
