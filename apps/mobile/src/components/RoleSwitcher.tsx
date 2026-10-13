import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Crown, Shield, Zap, type LucideIcon } from './icons';
import type { UserRole } from '@aurafit/shared';
import { useTheme } from '../theme/ThemeProvider';
import { AppIcon } from './AppIcon';
import { MIN_TOUCH_TARGET, fontSize, radius, spacing } from '../theme/tokens';

const ROLE_OPTIONS: { role: UserRole; icon: LucideIcon; label: string }[] = [
  { role: 'MEMBER', icon: Zap, label: 'Athlete' },
  { role: 'CREATOR', icon: Crown, label: 'Creator' },
  { role: 'ADMIN', icon: Shield, label: 'Admin' },
];

export function RoleSwitcher({ value, onChange }: { value: UserRole; onChange: (role: UserRole) => void }) {
  const { colors } = useTheme();

  return (
    <View accessibilityRole="tablist" style={styles.bar}>
      {ROLE_OPTIONS.map(({ role, icon, label }) => {
        const active = role === value;
        const fg = active ? colors.onPrimary : colors.textSecondary;
        return (
          <Pressable
            key={role}
            onPress={() => onChange(role)}
            accessibilityRole="tab"
            accessibilityLabel={`${label} view`}
            accessibilityState={{ selected: active }}
            hitSlop={{ top: 6, bottom: 6 }}
            style={({ pressed }) => [
              styles.pill,
              {
                backgroundColor: active ? colors.primaryStrong : colors.bgElevated,
                borderColor: active ? colors.primaryStrong : colors.border,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <View style={styles.content}>
              <AppIcon icon={icon} size={fontSize.body + 1} color={fg} strokeWidth={2.25} />
              <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[styles.text, { color: fg }]}>
                {label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  pill: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  text: {
    flexShrink: 1,
    fontSize: fontSize.body - 1,
    fontWeight: '700',
  },
});
