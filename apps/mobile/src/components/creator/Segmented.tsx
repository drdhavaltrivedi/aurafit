import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, radius, spacing } from '../../theme/tokens';

interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string; accessibilityLabel?: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Spoken name of the group (e.g. "Analytics range"). */
  accessibilityLabel: string;
  testIDPrefix?: string;
}

/** Two-to-four option toggle (range selector, All / Following). */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel, testIDPrefix }: SegmentedProps<T>) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.wrap, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            testID={testIDPrefix ? `${testIDPrefix}-${o.value}` : undefined}
            accessibilityRole="radio"
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            accessibilityState={{ selected, checked: selected }}
            hitSlop={4}
            style={({ pressed }) => [
              styles.item,
              { backgroundColor: selected ? colors.primaryStrong : 'transparent', opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.label, { color: selected ? colors.onPrimary : colors.textSecondary }]} maxFontSizeMultiplier={1.6}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

/** Small selectable pill (category, difficulty, vibe suggestions, schedule presets). */
export function Chip({ label, selected = false, onPress, accessibilityLabel, testID }: ChipProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, checked: selected }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.primaryStrong : colors.bgSurface,
          borderColor: selected ? colors.primaryStrong : colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.onPrimary : colors.textSecondary }]} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  item: {
    minHeight: MIN_TOUCH_TARGET - 8,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: fontSize.caption + 1,
    fontWeight: '800',
  },
  chip: {
    minHeight: MIN_TOUCH_TARGET - 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: fontSize.caption + 1,
    fontWeight: '700',
  },
});
