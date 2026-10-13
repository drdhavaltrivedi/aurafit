import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PlayerAttributes } from '@aurafit/shared';
import { useTheme } from '../theme/ThemeProvider';
import { AppIcon } from './AppIcon';
import { Dumbbell, HeartPulse, Sparkles, Zap } from './icons';
import { fontSize, radius, spacing } from '../theme/tokens';

interface StatCardsRowProps {
  attributes: PlayerAttributes;
}

export function StatCardsRow({ attributes }: StatCardsRowProps) {
  const { colors } = useTheme();

  const stats = [
    {
      key: 'str',
      label: 'STR',
      value: attributes.str,
      color: colors.danger,
      bgSubtle: colors.dangerSubtle,
      icon: Dumbbell,
    },
    {
      key: 'agi',
      label: 'AGI',
      value: attributes.agi,
      color: colors.cyan,
      bgSubtle: colors.cyanSubtle,
      icon: Zap,
    },
    {
      key: 'end',
      label: 'END',
      value: attributes.end,
      color: colors.emerald,
      bgSubtle: colors.emeraldSubtle,
      icon: HeartPulse,
    },
    {
      key: 'rec',
      label: 'REC',
      value: attributes.rec,
      color: colors.primary,
      bgSubtle: colors.primarySubtle,
      icon: Sparkles,
    },
  ];

  return (
    <View style={styles.row}>
      {stats.map((s) => (
        <View
          key={s.key}
          style={[
            styles.card,
            {
              backgroundColor: colors.bgSurface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: s.bgSubtle }]}>
            <AppIcon icon={s.icon} size={18} color={s.color} strokeWidth={2.4} />
          </View>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
          <Text style={[styles.statVal, { color: colors.textPrimary }]}>{s.value}</Text>
          <View style={[styles.statBarTrack, { backgroundColor: colors.bgElevated }]}>
            <View
              style={[
                styles.statBarFill,
                { backgroundColor: s.color, width: `${Math.min(Math.max(s.value, 15), 100)}%` },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  card: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 4,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statVal: {
    fontSize: fontSize.title - 1,
    fontWeight: '900',
  },
  statBarTrack: {
    width: '80%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
  },
  statBarFill: {
    height: '100%',
    borderRadius: 2,
  },
});
