import React from 'react';
import { ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native';
import {
  INITIAL_WORKOUT_DROPS,
  hasPermission,
  type Quest,
  type UserProfile,
  type UserRole,
  type WorkoutDrop,
} from '@aurafit/shared';
import { Flame, ScrollText } from '../components/icons';
import { DailyQuestHeroCard } from '../components/DailyQuestHeroCard';
import { HunterHeroCard } from '../components/HunterHeroCard';
import { QuestCard } from '../components/QuestCard';
import { QuickActionsRow } from '../components/QuickActionsRow';
import { SectionHeader } from '../components/SectionHeader';
import { StatCardsRow } from '../components/StatCardsRow';
import { TodaySummaryCard } from '../components/TodaySummaryCard';
import { WorkoutDropCard } from '../components/WorkoutDropCard';
import { useTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/tokens';

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
  /** Navigation handler for the 5 quick actions */
  onNavigateAction?: (actionKey: 'snacks' | 'hunter_card' | 'guild' | 'leaderboard' | 'rewards') => void;
  onOpenAccount?: () => void;
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
  onNavigateAction,
  onOpenAccount,
}: MemberScreenProps) {
  const { colors } = useTheme();
  const canDoQuests = hasPermission(role, 'DO_QUESTS');
  const canStartWorkout = hasPermission(role, 'START_WORKOUT');

  // Find the first uncompleted quest or fallback to first quest
  const primaryDailyQuest = quests.find((q) => !q.completed) || quests[0];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
      refreshControl={refreshControl}
    >
      {header}

      {/* Screen 1: Hunter Hero Profile Card */}
      <HunterHeroCard
        user={user}
        onEditProfile={onOpenAccount}
        onViewRankDetails={onOpenAccount}
      />

      {/* Screen 1: 4 Stat Cards in a Row (STR, AGI, END, REC) */}
      <StatCardsRow attributes={user.attributes} />

      {/* Screen 1: Daily Quest Hero Card */}
      <DailyQuestHeroCard
        quest={primaryDailyQuest}
        onStartQuest={onCompleteQuest}
      />

      {/* Screen 1: 5 Quick Action Shortcuts */}
      <QuickActionsRow
        onPressAction={(act) => onNavigateAction ? onNavigateAction(act) : undefined}
      />

      {/* Screen 1: Today's Summary */}
      <TodaySummaryCard
        auraPoints={user.auraPoints}
        workoutsCompleted={1}
        workoutsTarget={1}
        streakDays={user.streakDays}
        onViewAll={() => onNavigateAction ? onNavigateAction('snacks') : undefined}
      />

      {/* Hunter Quests Section */}
      <View style={styles.section}>
        <SectionHeader
          icon={ScrollText}
          title="Daily Hunter Quests"
          subtitle="Complete to boost stats & prevent aura decay"
        />
        {quests.map((q) => (
          <QuestCard key={q.id} quest={q} canComplete={canDoQuests} onComplete={onCompleteQuest} />
        ))}
      </View>

      {/* Trending Workout Drops Section */}
      <View style={styles.section}>
        <SectionHeader
          icon={Flame}
          iconColor={colors.orange}
          title="Trending Workout Drops"
          subtitle="Curated routines with boosted Aura multipliers"
        />
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
    paddingBottom: spacing.xxl + 40,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
});
