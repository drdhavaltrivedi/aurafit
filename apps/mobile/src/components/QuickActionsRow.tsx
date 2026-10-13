import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { AppIcon } from './AppIcon';
import { Gift, Shield, Trophy, Users, Zap } from './icons';
import { fontSize, radius, spacing } from '../theme/tokens';

interface QuickActionsRowProps {
  onPressAction: (actionKey: 'snacks' | 'hunter_card' | 'guild' | 'leaderboard' | 'rewards') => void;
}

export function QuickActionsRow({ onPressAction }: QuickActionsRowProps) {
  const { colors } = useTheme();

  const actions = [
    {
      key: 'snacks' as const,
      label: 'Movement\nSnacks',
      icon: Zap,
      color: colors.primary,
      bg: colors.primarySubtle,
    },
    {
      key: 'hunter_card' as const,
      label: 'Hunter\nCard',
      icon: Shield,
      color: colors.cyan,
      bg: colors.cyanSubtle,
    },
    {
      key: 'guild' as const,
      label: 'Hunter\nGuild',
      icon: Users,
      color: colors.cyan,
      bg: colors.cyanSubtle,
    },
    {
      key: 'leaderboard' as const,
      label: 'Top\nRankings',
      icon: Trophy,
      color: colors.primary,
      bg: colors.primarySubtle,
    },
    {
      key: 'rewards' as const,
      label: 'Hunter\nRewards',
      icon: Gift,
      color: colors.pink,
      bg: colors.pinkSubtle,
    },
  ];

  return (
    <View style={styles.container}>
      {actions.map((act) => (
        <Pressable
          key={act.key}
          onPress={() => onPressAction(act.key)}
          accessibilityRole="button"
          accessibilityLabel={act.label.replace('\n', ' ')}
          style={({ pressed }) => [
            styles.item,
            { opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <View style={[styles.iconBox, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
            <View style={[styles.innerGlow, { backgroundColor: act.bg }]}>
              <AppIcon icon={act.icon} size={20} color={act.color} strokeWidth={2.4} />
            </View>
          </View>
          <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={2}>
            {act.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerGlow: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 12,
  },
});
