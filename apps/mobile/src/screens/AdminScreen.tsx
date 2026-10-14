import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { INITIAL_GYM_LEADERBOARD, hasPermission, type GymLeaderboardEntry, type UserRole } from '@aurafit/shared';
import { Shield, Swords } from '../components/icons';
import { AppButton } from '../components/AppButton';
import { Avatar } from '../components/Avatar';
import { FormMessage } from '../components/AuthLayout';
import { ComingSoonCard, SampleDataTag } from '../components/DataNotice';
import { SectionHeader } from '../components/SectionHeader';
import type { PublicHunter } from '../api/types';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';

function GymRow({ gym }: { gym: GymLeaderboardEntry }) {
  const { colors } = useTheme();
  const aura = `${(gym.totalAuraEarned / 1_000_000).toFixed(1)}M`;
  return (
    <View
      accessible
      accessibilityLabel={`Rank ${gym.rank}: ${gym.gymName}, ${gym.city}. ${gym.activeSquads} squads. ${aura} aura.`}
      style={[styles.row, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}
    >
      <View style={styles.rowLeft}>
        <Text style={[styles.rank, { color: colors.orange }]}>#{gym.rank}</Text>
        <View style={styles.rowText}>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{gym.gymName}</Text>
          <Text style={[styles.city, { color: colors.textSecondary }]}>
            {gym.city} • {gym.activeSquads} Squads
          </Text>
        </View>
      </View>
      <Text style={[styles.aura, { color: colors.primary }]}>{aura} AURA</Text>
    </View>
  );
}

export function HunterRow({ hunter, position, isYou = false }: { hunter: PublicHunter; position: number; isYou?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`Number ${position}: ${hunter.username}${isYou ? ' (you)' : ''}, ${hunter.rank}. ${hunter.auraPoints.toLocaleString()} aura.`}
      style={[
        styles.row,
        { backgroundColor: isYou ? colors.primarySubtle : colors.bgSurface, borderColor: isYou ? colors.primary : colors.border },
      ]}
    >
      <View style={styles.rowLeft}>
        <Text style={[styles.rank, { color: colors.orange }]}>#{position}</Text>
        <Avatar name={hunter.username} url={hunter.avatarUrl} size={36} />
        <View style={styles.rowText}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {hunter.username}
            {isYou ? ' (you)' : ''}
          </Text>
          <Text style={[styles.city, { color: colors.textSecondary }]}>
            {hunter.handle} • {hunter.rank}
          </Text>
        </View>
      </View>
      <Text style={[styles.aura, { color: colors.primary }]}>{hunter.auraPoints.toLocaleString()} AURA</Text>
    </View>
  );
}

interface AdminScreenProps {
  role: UserRole;
  /**
   * Demo mode: the seeded gym leaderboard, labelled as sample data. Server mode (`false`): only the live
   * hunters leaderboard from the API; gym data is not available yet and says so.
   */
  sample: boolean;
  /** Live top hunters from /api/v1/leaderboard (server mode only). */
  hunters?: PublicHunter[];
  huntersLoading?: boolean;
  huntersError?: string | null;
  onRetry?: () => void;
}

export function AdminScreen(props: AdminScreenProps) {
  return props.sample ? <SampleAdmin role={props.role} /> : <LiveAdmin {...props} />;
}

function SampleAdmin({ role }: { role: UserRole }) {
  const { colors } = useTheme();
  const canView = hasPermission(role, 'VIEW_GYM_LEADERBOARD');
  const canManage = hasPermission(role, 'MANAGE_GYM_AFFILIATION');

  return (
    <FlatList
      data={canView ? INITIAL_GYM_LEADERBOARD : []}
      keyExtractor={(g) => g.gymName}
      renderItem={({ item }) => <GymRow gym={item} />}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.header}>
          <SectionHeader
            icon={Shield}
            title="Gym Leaderboard & Platform"
            subtitle={
              canManage
                ? 'Global gym competitions and aura retention health'
                : 'Global gym competitions (read-only)'
            }
          />
          <SampleDataTag />
        </View>
      }
      ListEmptyComponent={
        <Text style={{ color: colors.textSecondary, fontSize: fontSize.body }}>No leaderboard data.</Text>
      }
    />
  );
}

function LiveAdmin({ hunters = [], huntersLoading = false, huntersError = null, onRetry }: AdminScreenProps) {
  const { colors } = useTheme();
  const top = hunters.slice(0, 10);

  return (
    <FlatList
      data={top}
      keyExtractor={(h) => h.id}
      renderItem={({ item, index }) => <HunterRow hunter={item} position={index + 1} />}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.header}>
          <SectionHeader icon={Swords} title="Top Hunters" subtitle="Live global leaderboard" />
          {huntersError ? (
            <>
              <FormMessage tone="error" message={huntersError} />
              {onRetry ? <AppButton label="Try again" variant="secondary" onPress={onRetry} /> : null}
            </>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        huntersError ? null : huntersLoading ? (
          <ActivityIndicator color={colors.primary} accessibilityLabel="Loading leaderboard" />
        ) : (
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.body }}>No hunters on the board yet.</Text>
        )
      }
      ListFooterComponent={
        <View style={styles.footer}>
          <ComingSoonCard
            title="Gym leaderboard & affiliations"
            body="Gym rankings, active squads and affiliation management will appear here once gyms can join AuraFit."
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm + 2,
  },
  footer: {
    marginTop: spacing.md,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm + 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    flexShrink: 1,
  },
  rowText: {
    flexShrink: 1,
  },
  rank: {
    fontSize: fontSize.body,
    fontWeight: '900',
  },
  name: {
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  city: {
    fontSize: fontSize.caption,
  },
  aura: {
    fontSize: fontSize.caption + 1,
    fontWeight: '900',
  },
});
