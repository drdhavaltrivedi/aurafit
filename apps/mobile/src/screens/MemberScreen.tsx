import React from 'react';
import { ScrollView, StyleSheet, Text, View, type RefreshControlProps } from 'react-native';
import {
  INITIAL_WORKOUT_DROPS,
  getRankFromAura,
  hasPermission,
  type Quest,
  type UserProfile,
  type UserRole,
  type WorkoutDrop,
} from '@aurafit/shared';
import { Flame, ScrollText, Swords } from '../components/icons';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { ProgressBar } from '../components/ProgressBar';
import { QuestCard } from '../components/QuestCard';
import { SectionHeader } from '../components/SectionHeader';
import { StatGrid } from '../components/StatGrid';
import { WorkoutDropCard } from '../components/WorkoutDropCard';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';

interface MemberScreenProps {
  role: UserRole;
  user: UserProfile;
  quests: Quest[];
  onCompleteQuest: (questId: string) => void;
  onStartWorkout: (drop: WorkoutDrop) => void;
  /** Workout drops to show; defaults to the bundled seed drops (demo mode). */
  drops?: WorkoutDrop[];
  /** Optional element rendered above the profile card (e.g. a sync error notice). */
  header?: React.ReactNode;
  /** Pull-to-refresh control (server mode). */
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

export function MemberScreen({
  role,
  user,
  quests,
  onCompleteQuest,
  onStartWorkout,
  drops = INITIAL_WORKOUT_DROPS,
  header,
  refreshControl,
}: MemberScreenProps) {
  const { colors } = useTheme();
  const rankInfo = getRankFromAura(user.auraPoints);
  const canDoQuests = hasPermission(role, 'DO_QUESTS');
  const canStartWorkout = hasPermission(role, 'START_WORKOUT');
  const progressLabel = rankInfo.nextRank
    ? `${rankInfo.progressToNext}% to ${rankInfo.nextRank}`
    : 'Max rank reached';

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
      refreshControl={refreshControl}
    >
      {header}
      <Card>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderText}>
            <View style={[styles.rankBadge, { backgroundColor: colors.primarySubtle, borderColor: colors.primary }]}>
              {/* Rank is derived from aura so it updates as soon as a threshold is crossed. */}
              <Text style={[styles.rankBadgeText, { color: colors.primary }]}>{rankInfo.rank} HUNTER</Text>
            </View>
            <Text accessibilityRole="header" style={[styles.name, { color: colors.textPrimary }]}>
              {user.username}
            </Text>
            <Text style={[styles.handle, { color: colors.textSecondary }]}>
              {user.handle} • LV. {user.level}
            </Text>
          </View>
          <View
            style={[styles.avatar, { borderColor: colors.primary }]}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <AppIcon icon={Swords} size={22} color={colors.primary} strokeWidth={2.25} />
          </View>
        </View>

        <View style={[styles.progressWrap, { backgroundColor: colors.bgElevated }]}>
          <View style={styles.progressLabels}>
            <Text style={[styles.progressText, { color: colors.textSecondary }]}>Rank Ascendance</Text>
            <Text style={[styles.progressPct, { color: colors.primary }]}>{progressLabel}</Text>
          </View>
          <ProgressBar value={rankInfo.progressToNext} label={`Rank progress, ${progressLabel}`} />
        </View>

        <View style={styles.statWrap}>
          <StatGrid
            items={[
              { label: 'STR (Strength)', value: user.attributes.str },
              { label: 'AGI (Agility)', value: user.attributes.agi },
              { label: 'END (Stamina)', value: user.attributes.end },
              { label: 'REC (Mobility)', value: user.attributes.rec },
            ]}
          />
        </View>
      </Card>

      <View style={styles.section}>
        <SectionHeader icon={ScrollText} title="Daily Hunter Quests" subtitle="Complete to boost stats & prevent aura decay" />
        {quests.map((q) => (
          <QuestCard key={q.id} quest={q} canComplete={canDoQuests} onComplete={onCompleteQuest} />
        ))}
      </View>

      <View style={styles.section}>
        <SectionHeader icon={Flame} iconColor={colors.orange} title="Trending Workout Drops" subtitle="Curated routines with boosted Aura multipliers" />
        {drops.map((drop) => (
          <WorkoutDropCard key={drop.id} drop={drop} canStart={canStartWorkout} onStart={onStartWorkout} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl + spacing.sm,
    gap: spacing.lg + 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardHeaderText: {
    flex: 1,
  },
  rankBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  rankBadgeText: {
    fontSize: fontSize.caption - 1,
    fontWeight: '900',
  },
  name: {
    fontSize: fontSize.headline,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
  handle: {
    fontSize: fontSize.caption,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressWrap: {
    marginTop: spacing.md + 2,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    gap: 6,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  progressText: {
    fontSize: fontSize.caption,
  },
  progressPct: {
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  statWrap: {
    marginTop: spacing.md + 2,
  },
  section: {
    gap: spacing.sm + 2,
  },
});
