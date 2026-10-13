import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  CREATOR_USER,
  INITIAL_WORKOUT_DROPS,
  hasPermission,
  type UserProfile,
  type UserRole,
  type WorkoutDrop,
} from '@aurafit/shared';
import { Crown } from '../components/icons';
import { FormMessage } from '../components/AuthLayout';
import { ComingSoonCard, SampleDataTag } from '../components/DataNotice';
import { SectionHeader } from '../components/SectionHeader';
import { StatGrid } from '../components/StatGrid';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, spacing } from '../theme/tokens';

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString();
}

interface CreatorScreenProps {
  role: UserRole;
  /**
   * Demo mode: show seed figures (including placeholder subscriber/revenue numbers), labelled as sample
   * data. Server mode (`false`): only figures derived from real drops; the rest is "Coming soon".
   */
  sample: boolean;
  /** Signed-in creator (server mode); defaults to the seed creator in demo mode. */
  profile?: UserProfile;
  /** Drops to aggregate; defaults to the bundled seed drops. */
  drops?: WorkoutDrop[];
  dropsLoading?: boolean;
  dropsError?: string | null;
}

export function CreatorScreen({
  role,
  sample,
  profile = CREATOR_USER,
  drops = INITIAL_WORKOUT_DROPS,
  dropsLoading = false,
  dropsError = null,
}: CreatorScreenProps) {
  const { colors } = useTheme();
  const canViewAnalytics = hasPermission(role, 'VIEW_CREATOR_ANALYTICS');

  const stats = useMemo(() => {
    const myDrops = drops.filter((d) => d.creatorId === profile.id);
    const completions = myDrops.reduce((sum, d) => sum + d.completionsCount, 0);
    const likes = myDrops.reduce((sum, d) => sum + d.likesCount, 0);
    const real = [
      { label: 'Drops Published', value: compact(myDrops.length) },
      { label: 'Drop Likes', value: compact(likes) },
      { label: 'Completions', value: compact(completions) },
    ];
    // Subscriber / revenue figures are seed placeholders: only ever shown in demo mode.
    return sample ? [{ label: 'Squad Subs', value: '320' }, { label: 'MRR Revenue', value: '$2,450' }, ...real] : real;
  }, [drops, profile.id, sample]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SectionHeader
        icon={Crown}
        title="Creator Studio"
        subtitle={`${profile.username} • ${profile.title}`}
      />
      {canViewAnalytics ? (
        <>
          {sample ? <SampleDataTag /> : null}
          {!sample && dropsError ? <FormMessage tone="error" message={dropsError} /> : null}
          {!sample && dropsLoading && drops.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: fontSize.body }}>Loading your drops…</Text>
          ) : (
            <StatGrid items={stats} />
          )}
          {!sample ? (
            <ComingSoonCard
              title="Subscribers & revenue"
              body="Squad subscriptions and payouts aren't live yet. Your earnings will appear here once they are."
            />
          ) : null}
        </>
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
