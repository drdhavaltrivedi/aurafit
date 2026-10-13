import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CREATOR_USER, INITIAL_WORKOUT_DROPS, hasPermission, type UserRole } from '@aurafit/shared';
import { SectionHeader } from '../components/SectionHeader';
import { StatGrid } from '../components/StatGrid';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, spacing } from '../theme/tokens';

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString();
}

export function CreatorScreen({ role }: { role: UserRole }) {
  const { colors } = useTheme();
  const canViewAnalytics = hasPermission(role, 'VIEW_CREATOR_ANALYTICS');

  const stats = useMemo(() => {
    const myDrops = INITIAL_WORKOUT_DROPS.filter((d) => d.creatorId === CREATOR_USER.id);
    const completions = myDrops.reduce((sum, d) => sum + d.completionsCount, 0);
    const likes = myDrops.reduce((sum, d) => sum + d.likesCount, 0);
    return [
      // Subscriber / revenue figures are demo placeholders until billing data is wired up.
      { label: 'Squad Subs', value: '320' },
      { label: 'MRR Revenue', value: '$2,450' },
      { label: 'Drop Likes', value: compact(likes) },
      { label: 'Completions', value: compact(completions) },
    ];
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SectionHeader
        title="👑 Creator Studio"
        subtitle={`${CREATOR_USER.username} • ${CREATOR_USER.title}`}
      />
      {canViewAnalytics ? (
        <StatGrid items={stats} />
      ) : (
        <View style={styles.locked}>
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.body }}>
            Creator analytics are available to creators and admins.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  locked: {
    paddingVertical: spacing.xl,
  },
});
