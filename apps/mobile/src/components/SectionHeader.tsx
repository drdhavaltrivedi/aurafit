import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { LucideIcon } from './icons';
import { fontSize, spacing } from '../theme/tokens';
import { AppIcon } from './AppIcon';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional decorative icon shown before the title. */
  icon?: LucideIcon;
  /** Icon colour; defaults to the theme's primary accent. */
  iconColor?: string;
}

export function SectionHeader({ title, subtitle, icon, iconColor }: SectionHeaderProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        {icon ? <AppIcon icon={icon} size={fontSize.title + 1} color={iconColor ?? colors.primary} strokeWidth={2.25} /> : null}
        <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
          {title}
        </Text>
      </View>
      {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 2,
    marginBottom: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flexShrink: 1,
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: fontSize.caption + 1,
  },
});
