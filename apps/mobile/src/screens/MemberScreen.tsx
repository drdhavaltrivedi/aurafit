import React from 'react';
import { ScrollView, StyleSheet, Text, View, type RefreshControlProps } from 'react-native';
import { hasPermission, type Quest, type UserProfile, type UserRole, type WorkoutDrop } from '@aurafit/shared';
import { Dumbbell, Flame } from '../components/icons';
import { AppButton } from '../components/AppButton';
import { AppIcon } from '../components/AppIcon';
import { SampleDataTag } from '../components/DataNotice';
import { DailyQuestHeroCard } from '../components/DailyQuestHeroCard';
import { HunterHeroCard } from '../components/HunterHeroCard';
import { QuickActionsRow } from '../components/QuickActionsRow';
import { SectionHeader } from '../components/SectionHeader';
import { StatCardsRow } from '../components/StatCardsRow';
import { TodaySummaryCard } from '../components/TodaySummaryCard';
import { WorkoutDropCard } from '../components/WorkoutDropCard';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';

export type QuickActionKey = 'snacks' | 'hunter_card' | 'guild' | 'leaderboard' | 'rewards';

const TRENDING_LIMIT = 3;

interface MemberScreenProps {
  role: UserRole;
  user: UserProfile;
  quests: Quest[];
  drops: WorkoutDrop[];
  /** Demo mode: drops are bundled samples (labelled). */
  sampleDrops: boolean;
  dropsLoading?: boolean;
  onCompleteQuest: (questId: string) => void;
  onStartWorkout: (drop: WorkoutDrop) => void;
  onOpenCreator?: (handle: string) => void;
  /** Optional element rendered above the profile card (e.g. a sync error notice). */
  header?: React.ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  onQuickAction: (key: QuickActionKey) => void;
  onOpenQuests: () => void;
  onOpenWorkouts: () => void;
  onEditProfile: () => void;
  onOpenHunterCard: () => void;
}

export function MemberScreen({
  role,
  user,
  quests,
  drops,
  sampleDrops,
  dropsLoading = false,
  onCompleteQuest,
  onStartWorkout,
  onOpenCreator,
  header,
  refreshControl,
  onQuickAction,
  onOpenQuests,
  onOpenWorkouts,
  onEditProfile,
  onOpenHunterCard,
}: MemberScreenProps) {
  const { colors } = useTheme();
  const canDoQuests = hasPermission(role, 'DO_QUESTS');
  const canStartWorkout = hasPermission(role, 'START_WORKOUT');
  const nextQuest = quests.find((q) => !q.completed);
  const doneCount = quests.filter((q) => q.completed).length;
  const trending = drops.slice(0, TRENDING_LIMIT);

  return (
    <ScrollView
      testID="member-scroll"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
      refreshControl={refreshControl}
    >
      {header}

      <HunterHeroCard user={user} onEditProfile={onEditProfile} onViewRankDetails={onOpenHunterCard} />
      <StatCardsRow attributes={user.attributes} />
      <DailyQuestHeroCard
        quest={nextQuest}
        canComplete={canDoQuests}
        doneCount={doneCount}
        totalCount={quests.length}
        onCompleteQuest={onCompleteQuest}
        onOpenQuests={onOpenQuests}
      />
      <QuickActionsRow onPressAction={onQuickAction} />
      <TodaySummaryCard
        auraPoints={user.auraPoints}
        questsCompleted={doneCount}
        questsTotal={quests.length}
        streakDays={user.streakDays}
        onViewAll={onOpenQuests}
      />

      <View style={styles.section}>
        <SectionHeader
          icon={Flame}
          iconColor={colors.orange}
          title="Trending Workout Drops"
          subtitle="Curated routines with boosted aura multipliers"
        />
        {sampleDrops ? <SampleDataTag /> : null}
        {trending.length === 0 ? (
          <View testID="home-drops-empty" style={[styles.empty, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
            <AppIcon icon={Dumbbell} size={24} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {dropsLoading ? 'Loading workout drops…' : 'No workout drops yet'}
            </Text>
            {!dropsLoading ? (
              <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
                Creators haven't published any workouts yet. Your daily quests still earn aura.
              </Text>
            ) : null}
          </View>
        ) : (
          trending.map((drop) => (
            <WorkoutDropCard key={drop.id} drop={drop} canStart={canStartWorkout} onStart={onStartWorkout} onOpenCreator={onOpenCreator} />
          ))
        )}
        <AppButton label="Browse all workouts" variant="secondary" onPress={onOpenWorkouts} testID="home-browse-workouts" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: fontSize.bodyLg,
    fontWeight: '800',
  },
  emptyBody: {
    fontSize: fontSize.body,
    textAlign: 'center',
  },
});
