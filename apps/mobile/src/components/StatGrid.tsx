import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';

export interface StatItem {
  label: string;
  value: string | number;
}

export function StatGrid({ items }: { items: StatItem[] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <View
          key={item.label}
          accessible
          accessibilityLabel={`${item.label}: ${item.value}`}
          style={[styles.box, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}
        >
          <Text style={[styles.label, { color: colors.textSecondary }]}>{item.label}</Text>
          <Text style={[styles.value, { color: colors.textPrimary }]}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  box: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  label: {
    fontSize: fontSize.caption,
  },
  value: {
    fontSize: fontSize.bodyLg + 2,
    fontWeight: '900',
    marginTop: 2,
  },
});
