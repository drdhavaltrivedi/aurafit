import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { INITIAL_GYM_LEADERBOARD, hasPermission, type GymLeaderboardEntry, type UserRole } from '@aurafit/shared';
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

function HunterRow({ hunter, position }: { hunter: PublicHunter; position: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`Number ${position}: ${hunter.username}, ${hunter.rank}. ${hunter.auraPoints.toLocaleString()} aura.`}
      style={[styles.row, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}
    >
      <View style={styles.rowLeft}>
        <Text style={[styles.rank, { color: colors.orange }]}>#{position}</Text>
        <View style={styles.rowText}>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{hunter.username}</Text>
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
  /** Live top hunters from /api/v1/leaderboard (server mode only). */
  hunters?: PublicHunter[];
}

export function AdminScreen({ role, hunters }: AdminScreenProps) {
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
          {hunters && hunters.length > 0 ? (
            <View style={styles.header}>
              <SectionHeader title="⚔️ Top Hunters" subtitle="Live global leaderboard" />
              {hunters.slice(0, 10).map((h, i) => (
                <HunterRow key={h.id} hunter={h} position={i + 1} />
              ))}
            </View>
          ) : null}
          <SectionHeader
            title="🛡️ Gym Leaderboard & Platform"
            subtitle={
              canManage
                ? 'Global gym competitions and aura retention health'
                : 'Global gym competitions (read-only)'
            }
          />
        </View>
      }
      ListEmptyComponent={
        <Text style={{ color: colors.textSecondary, fontSize: fontSize.body }}>No leaderboard data.</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm + 2,
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
