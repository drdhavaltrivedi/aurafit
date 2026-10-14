import React, { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, type RefreshControlProps } from 'react-native';
import { INITIAL_SQUADS, type Squad } from '@aurafit/shared';
import { Trophy, Users } from '../components/icons';
import { AppButton } from '../components/AppButton';
import { AppIcon } from '../components/AppIcon';
import { FormMessage } from '../components/AuthLayout';
import { ComingSoonCard, SampleDataTag } from '../components/DataNotice';
import { ProgressBar } from '../components/ProgressBar';
import { SectionHeader } from '../components/SectionHeader';
import type { PublicHunter } from '../api/types';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';
import { HunterRow } from './AdminScreen';

const STATUS_LABEL: Record<Squad['status'], string> = {
  LOCKED_IN: 'Locked in',
  ON_FIRE: 'On fire',
  NEEDS_SAVING: 'Needs saving',
};

interface Props {
  /** Demo mode: show the sample squads (labelled). Signed-in mode: guilds are not live yet. */
  sample: boolean;
  /** Live top hunters (signed-in mode) so the tab always has real content. */
  hunters: PublicHunter[];
  huntersLoading: boolean;
  huntersError: string | null;
  currentUserId: string;
  onRetry: () => void;
  onOpenLeaderboard: () => void;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

export function GuildScreen({
  sample,
  hunters,
  huntersLoading,
  huntersError,
  currentUserId,
  onRetry,
  onOpenLeaderboard,
  refreshControl,
}: Props) {
  const { colors } = useTheme();
  const top = hunters.slice(0, 5);

  // Refresh the live board each time the tab is opened.
  useEffect(() => {
    if (!sample) onRetry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScrollView
      testID="guild-screen"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      <SectionHeader icon={Users} title="Hunter Guild" subtitle="Train together. Raid bigger." />

      {sample ? (
        <>
          <SampleDataTag />
          {INITIAL_SQUADS.map((s) => (
            <View
              key={s.id}
              accessible
              accessibilityLabel={`Number ${s.rankPosition}: ${s.name}. ${s.memberCount} of ${s.maxMembers} members. ${s.totalAura.toLocaleString()} aura. Weekly goal ${s.weeklyGoalProgress} percent. ${STATUS_LABEL[s.status]}.`}
              style={[styles.squad, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}
            >
              <View style={styles.squadTop}>
                <Text style={[styles.pos, { color: colors.orange }]}>#{s.rankPosition}</Text>
                <View style={[styles.squadIcon, { backgroundColor: colors.primarySubtle }]}>
                  <AppIcon name={s.avatar} size={20} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                    {s.name} <Text style={{ color: colors.textMuted }}>[{s.tag}]</Text>
                  </Text>
                  <Text style={[styles.muted, { color: colors.textSecondary }]}>
                    {s.memberCount}/{s.maxMembers} hunters • led by {s.leaderName} • {STATUS_LABEL[s.status]}
                  </Text>
                </View>
                <Text style={[styles.aura, { color: colors.primary }]}>{s.totalAura.toLocaleString()}</Text>
              </View>
              <ProgressBar value={s.weeklyGoalProgress} label={`${s.name} weekly goal`} />
            </View>
          ))}
        </>
      ) : (
        <ComingSoonCard
          title="Guilds & squad raids"
          body="Joining a guild, squad raids and guild chat aren't live yet. Until then, compete on the global leaderboard below."
        />
      )}

      <SectionHeader icon={Trophy} title="Top hunters" subtitle={sample ? 'Sample leaderboard' : 'Live global leaderboard'} />
      {huntersError ? (
        <>
          <FormMessage tone="error" message={huntersError} />
          <AppButton label="Try again" variant="secondary" onPress={onRetry} />
        </>
      ) : huntersLoading && top.length === 0 ? (
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading leaderboard" />
      ) : top.length === 0 ? (
        <Text style={[styles.muted, { color: colors.textSecondary }]}>No hunters on the board yet.</Text>
      ) : (
        top.map((h, i) => <HunterRow key={h.id} hunter={h} position={i + 1} isYou={h.id === currentUserId} />)
      )}
      <AppButton label="See full leaderboard" variant="secondary" onPress={onOpenLeaderboard} testID="guild-open-leaderboard" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  squad: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  squadTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pos: {
    fontSize: fontSize.body,
    fontWeight: '900',
  },
  squadIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  muted: {
    fontSize: fontSize.caption,
  },
  aura: {
    fontSize: fontSize.caption + 1,
    fontWeight: '900',
  },
});
