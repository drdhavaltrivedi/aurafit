import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type RefreshControlProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Quest, WorkoutDrop } from '@aurafit/shared';
import { Dumbbell, Flame, HeartPulse, Sparkles, Timer, Zap, type LucideIcon } from '../components/icons';
import { AppButton } from '../components/AppButton';
import { DropReportButton } from '../components/moderation/ReportButton';
import { AppIcon } from '../components/AppIcon';
import { FormMessage } from '../components/AuthLayout';
import { SampleDataTag } from '../components/DataNotice';
import { QuestCard } from '../components/QuestCard';
import { SectionHeader } from '../components/SectionHeader';
import { Segmented } from '../components/creator/Segmented';
import { useFollowing } from '../hooks/useFollowing';
import { filterByFollowing, type DropFeedFilter } from '../lib/creator';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, radius, spacing } from '../theme/tokens';

type Category = WorkoutDrop['category'];
type Filter = 'ALL' | Category;

const FILTERS: { key: Filter; label: string; icon: LucideIcon }[] = [
  { key: 'ALL', label: 'All', icon: Flame },
  { key: 'STRENGTH', label: 'Strength', icon: Dumbbell },
  { key: 'HIIT', label: 'HIIT', icon: Zap },
  { key: 'POSTURE_RESET', label: 'Posture', icon: Sparkles },
  { key: 'CARDIO_SNACK', label: 'Cardio', icon: HeartPulse },
];

const CATEGORY_ICON: Record<Category, LucideIcon> = {
  STRENGTH: Dumbbell,
  HIIT: Zap,
  POSTURE_RESET: Sparkles,
  CARDIO_SNACK: HeartPulse,
};

const HEX = /^#[0-9a-f]{6}$/i;

interface Props {
  /** All quests; only MOVEMENT_SNACK quests are listed here. */
  quests: Quest[];
  drops: WorkoutDrop[];
  canComplete: boolean;
  canStart: boolean;
  onCompleteQuest: (questId: string) => void;
  onStartWorkout: (drop: WorkoutDrop) => void;
  /** Demo mode: drops are the bundled samples. */
  sample: boolean;
  dropsLoading?: boolean;
  dropsError?: string | null;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Signed in: show the All / Following filter (creators the user follows). */
  followFilter?: boolean;
  /** Tapping a creator name opens their profile. */
  onOpenCreator?: (handle: string) => void;
}

const FEED_OPTIONS = [
  { value: 'all' as const, label: 'All', accessibilityLabel: 'All workout drops' },
  { value: 'following' as const, label: 'Following', accessibilityLabel: 'Drops from creators you follow' },
];

/** Workouts tab: movement-snack quests plus creator workout drops, filterable by category. */
export function MovementSnacksScreen({
  quests,
  drops,
  canComplete,
  canStart,
  onCompleteQuest,
  onStartWorkout,
  sample,
  dropsLoading = false,
  dropsError = null,
  refreshControl,
  followFilter = false,
  onOpenCreator,
}: Props) {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [feed, setFeed] = useState<DropFeedFilter>('all');
  const following = useFollowing();
  const chooseFeed = (f: DropFeedFilter) => {
    setFeed(f);
    // Fetched on every switch so follows made on a creator page show up without a reload.
    if (f === 'following') void following.load();
  };
  const activeFeed: DropFeedFilter = followFilter ? feed : 'all';
  const snacks = useMemo(() => quests.filter((q) => q.category === 'MOVEMENT_SNACK'), [quests]);
  const visible = useMemo(
    () => filterByFollowing(drops, activeFeed, following.ids).filter((d) => filter === 'ALL' || d.category === filter),
    [drops, activeFeed, following.ids, filter]
  );
  const followingPending = activeFeed === 'following' && following.ids === null;

  return (
    <ScrollView
      testID="workouts-screen"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      <SectionHeader icon={Zap} title="Movement snacks" subtitle="Short moves between sessions. Tap to log one." />
      {snacks.length === 0 ? (
        <Text style={[styles.muted, { color: colors.textSecondary }]}>No movement snacks today.</Text>
      ) : (
        snacks.map((q) => <QuestCard key={q.id} quest={q} canComplete={canComplete} onComplete={onCompleteQuest} />)
      )}

      <SectionHeader icon={Dumbbell} title="Workout drops" subtitle="Creator routines with aura multipliers" />
      {sample ? <SampleDataTag /> : null}
      {followFilter ? (
        <Segmented options={FEED_OPTIONS} value={feed} onChange={chooseFeed} accessibilityLabel="Show drops from" testIDPrefix="feed" />
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map((f) => {
          const selected = filter === f.key;
          const fg = selected ? colors.onPrimary : colors.textSecondary;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              testID={`filter-${f.key}`}
              accessibilityRole="tab"
              accessibilityLabel={`${f.label} workouts`}
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.pill,
                {
                  backgroundColor: selected ? colors.primaryStrong : colors.bgSurface,
                  borderColor: selected ? colors.primaryStrong : colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <AppIcon icon={f.icon} size={14} color={fg} />
              <Text style={[styles.pillText, { color: fg }]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {dropsError ? <FormMessage tone="error" message={dropsError} /> : null}
      {activeFeed === 'following' && following.error ? (
        <View style={styles.followError}>
          <FormMessage tone="error" message={following.error} />
          <AppButton label="Retry" variant="secondary" onPress={() => void following.load()} testID="following-retry" />
        </View>
      ) : null}
      {(dropsLoading && drops.length === 0) || (followingPending && following.loading) ? (
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading workouts" />
      ) : null}
      {activeFeed === 'following' && !following.error && following.ids !== null && visible.length === 0 ? (
        <View testID="following-empty" style={[styles.empty, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
          <AppIcon icon={Dumbbell} size={26} color={colors.textMuted} />
          <Text style={[styles.muted, { color: colors.textSecondary, textAlign: 'center' }]}>
            {following.ids.size > 0
              ? 'Creators you follow have no live drops here right now.'
              : "You're not following any creators yet. Tap a creator's name to visit their page and follow them."}
          </Text>
        </View>
      ) : null}
      {activeFeed === 'all' && !dropsLoading && !dropsError && visible.length === 0 ? (
        <View testID="drops-empty" style={[styles.empty, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
          <AppIcon icon={Dumbbell} size={26} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            {drops.length === 0 ? 'No workout drops yet' : 'Nothing in this category'}
          </Text>
          <Text style={[styles.muted, { color: colors.textSecondary, textAlign: 'center' }]}>
            {drops.length === 0
              ? "Creators haven't published any workouts yet. Check back soon — your daily quests still earn aura."
              : 'Try another category.'}
          </Text>
        </View>
      ) : null}

      {visible.map((d) => {
        const [from, to] = d.coverGradient && HEX.test(d.coverGradient[0]) && HEX.test(d.coverGradient[1]) ? d.coverGradient : [colors.primaryStrong, colors.primary];
        return (
          <View key={d.id} style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
            <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.thumb}>
              <AppIcon icon={CATEGORY_ICON[d.category] ?? Dumbbell} size={26} color="#FFFFFF" strokeWidth={2.4} />
            </LinearGradient>
            <View
              style={styles.info}
              accessible={!onOpenCreator}
              accessibilityLabel={`${d.title} by ${d.creatorName}. ${d.durationMinutes} minutes, ${d.exercises.length} moves, ${d.auraMultiplier} times aura.`}
            >
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{d.title}</Text>
              {onOpenCreator && d.creatorHandle ? (
                <Pressable
                  onPress={() => onOpenCreator(d.creatorHandle)}
                  testID={`drop-creator-${d.id}`}
                  accessibilityRole="link"
                  accessibilityLabel={`By ${d.creatorName}. Open creator profile`}
                  hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: 'flex-start' })}
                >
                  <Text style={[styles.muted, styles.creatorLink, { color: colors.primary }]} numberOfLines={1}>
                    {d.creatorName}
                  </Text>
                </Pressable>
              ) : (
                <Text style={[styles.muted, { color: colors.textSecondary }]} numberOfLines={1}>
                  {d.creatorName}
                </Text>
              )}
              <View
                style={styles.meta}
                accessible={!!onOpenCreator}
                accessibilityLabel={`${d.durationMinutes} minutes, ${d.exercises.length} moves, ${d.auraMultiplier} times aura`}
              >
                <AppIcon icon={Timer} size={13} color={colors.textMuted} />
                <Text style={[styles.metaText, { color: colors.textMuted }]}>
                  {d.durationMinutes}m • {d.exercises.length} moves
                </Text>
                <Text style={[styles.metaText, { color: colors.primary, fontWeight: '800' }]}>{d.auraMultiplier}x</Text>
              </View>
            </View>
            <DropReportButton drop={d} compact />
            {canStart ? (
              <AppButton label="Start" onPress={() => onStartWorkout(d)} accessibilityLabel={`Start workout: ${d.title}`} testID={`workout-start-${d.id}`} />
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  muted: {
    fontSize: fontSize.caption + 1,
  },
  creatorLink: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  followError: {
    gap: spacing.sm,
  },
  filters: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET - 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  pillText: {
    fontSize: fontSize.caption + 1,
    fontWeight: '700',
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: fontSize.bodyLg,
    fontWeight: '800',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md + 2,
    borderWidth: 1,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: fontSize.bodyLg,
    fontWeight: '800',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  metaText: {
    fontSize: fontSize.caption,
  },
});
