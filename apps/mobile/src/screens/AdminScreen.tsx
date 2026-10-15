import React, { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { INITIAL_GYM_LEADERBOARD, hasPermission, type GymLeaderboardEntry, type UserRole } from '@aurafit/shared';
import { Shield, ShieldAlert } from '../components/icons';
import { Avatar } from '../components/Avatar';
import { SampleDataTag } from '../components/DataNotice';
import { useModerationActions } from '../components/moderation/ModerationProvider';
import { ReasonSheet, type ReasonAsk } from '../components/moderation/ReasonSheet';
import { SectionHeader } from '../components/SectionHeader';
import type { PublicHunter } from '../api/types';
import { errorMessage } from '../hooks/useApi';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';
import { type Act, type TabProps, Segmented } from './admin/AdminParts';
import { AuditTab } from './admin/AuditTab';
import { FlagsTab } from './admin/FlagsTab';
import { ReportsTab } from './admin/ReportsTab';
import { UsersTab } from './admin/UsersTab';

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
   * Demo mode: the seeded gym leaderboard, labelled as sample data. Server mode (`false`): the real
   * moderation console (reports, aura flags, users, audit log) for roles with AUDIT_ANTI_CHEAT.
   */
  sample: boolean;
}

export function AdminScreen(props: AdminScreenProps) {
  return props.sample ? <SampleAdmin role={props.role} /> : <LiveAdmin role={props.role} />;
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
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.caption + 1 }}>
            Sign in with an admin account to moderate reports, aura flags and users.
          </Text>
        </View>
      }
      ListEmptyComponent={
        <Text style={{ color: colors.textSecondary, fontSize: fontSize.body }}>No leaderboard data.</Text>
      }
    />
  );
}

type Tab = 'reports' | 'flags' | 'users' | 'audit';
const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: 'reports', label: 'Reports' },
  { value: 'flags', label: 'Flags' },
  { value: 'users', label: 'Users' },
  { value: 'audit', label: 'Audit' },
];

/** Real admin moderation (server mode). Every action is recorded in the audit log by the server. */
function LiveAdmin({ role }: { role: UserRole }) {
  const { colors } = useTheme();
  const moderation = useModerationActions();
  const [tab, setTab] = useState<Tab>('reports');
  const [ask, setAsk] = useState<ReasonAsk | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const notifyRef = useRef(moderation?.notify);
  notifyRef.current = moderation?.notify;

  const act = useCallback<Act>(async (run, success, after) => {
    const notify = notifyRef.current ?? ((text: string) => Alert.alert('Moderation', text));
    try {
      const result = await run();
      notify(typeof success === 'function' ? success(result) : success, 'success');
      after?.();
      return true;
    } catch (err) {
      notify(errorMessage(err), 'error');
      return false;
    }
  }, []);

  if (!hasPermission(role, 'AUDIT_ANTI_CHEAT')) {
    return (
      <View style={styles.content}>
        <SectionHeader icon={ShieldAlert} title="Moderation" subtitle="Admins only" />
        <Text style={{ color: colors.textSecondary, fontSize: fontSize.body }}>Your account doesn't have moderation access.</Text>
      </View>
    );
  }

  const props: TabProps = { act, ask: setAsk, refreshKey, viewerId: moderation?.viewerId ?? null };

  return (
    <>
      <ScrollView
        testID="admin-console"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => setRefreshKey((k) => k + 1)} tintColor={colors.primary} colors={[colors.primaryStrong]} />
        }
      >
        <SectionHeader icon={ShieldAlert} iconColor={colors.orange} title="Moderation" subtitle="Every action is recorded in the audit log." />
        <Segmented label="Moderation section" options={TABS} value={tab} onChange={setTab} testIDPrefix="admin-tab" />
        {tab === 'reports' ? <ReportsTab {...props} /> : null}
        {tab === 'flags' ? <FlagsTab {...props} /> : null}
        {tab === 'users' ? <UsersTab {...props} /> : null}
        {tab === 'audit' ? <AuditTab refreshKey={refreshKey} /> : null}
      </ScrollView>
      <ReasonSheet ask={ask} onClose={() => setAsk(null)} />
    </>
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
