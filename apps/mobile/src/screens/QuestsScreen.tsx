import React from 'react';
import { ScrollView, StyleSheet, Text, View, type RefreshControlProps } from 'react-native';
import type { Quest, QuestCategory } from '@aurafit/shared';
import { ScrollText } from '../components/icons';
import { ProgressBar } from '../components/ProgressBar';
import { QuestCard } from '../components/QuestCard';
import { SectionHeader } from '../components/SectionHeader';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';

const GROUPS: { category: QuestCategory; title: string; subtitle: string }[] = [
  { category: 'DAILY_QUEST', title: 'Daily quests', subtitle: 'Reset every day' },
  { category: 'MOVEMENT_SNACK', title: 'Movement snacks', subtitle: 'Quick wins between sessions' },
  { category: 'BOSS_RAID', title: 'Boss raids', subtitle: 'Bigger challenges, bigger aura' },
  { category: 'SQUAD_MISSION', title: 'Squad missions', subtitle: 'Team objectives' },
];

interface Props {
  quests: Quest[];
  canComplete: boolean;
  onComplete: (questId: string) => void;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Rendered above the summary (e.g. sample-data tag or a sync error). */
  header?: React.ReactNode;
}

export function QuestsScreen({ quests, canComplete, onComplete, refreshControl, header }: Props) {
  const { colors } = useTheme();
  const done = quests.filter((q) => q.completed).length;

  return (
    <ScrollView
      testID="quests-screen"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {header}
      <SectionHeader icon={ScrollText} title="Quests" subtitle="Complete quests to earn aura and raise your stats" />
      <View
        accessible
        accessibilityLabel={`${done} of ${quests.length} quests completed today`}
        style={[styles.summary, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}
      >
        <Text style={[styles.summaryText, { color: colors.textPrimary }]} testID="quests-summary">
          {done} / {quests.length} completed today
        </Text>
        <ProgressBar value={quests.length ? (done / quests.length) * 100 : 0} label="Quests completed today" />
      </View>
      {quests.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>No quests available right now. Pull to refresh.</Text>
      ) : null}
      {GROUPS.map((g) => {
        const list = quests.filter((q) => q.category === g.category);
        if (list.length === 0) return null;
        return (
          <View key={g.category} style={styles.group}>
            <SectionHeader title={g.title} subtitle={g.subtitle} />
            {list.map((q) => (
              <QuestCard key={q.id} quest={q} canComplete={canComplete} onComplete={onComplete} />
            ))}
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
    gap: spacing.lg,
  },
  summary: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  summaryText: {
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  empty: {
    fontSize: fontSize.body,
  },
  group: {
    gap: spacing.md,
  },
});
