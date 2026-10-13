import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, spacing } from '../theme/tokens';

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
        {title}
      </Text>
      {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 2,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: fontSize.caption + 1,
  },
});
