import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { ADMIN_ROLE_OPTIONS, normalizeUserSearch, type AdminUserListItem, type UserRole } from '@aurafit/shared';
import { ArrowLeft, ChevronRight, Search, UserX } from '../../components/icons';
import { AppButton } from '../../components/AppButton';
import { AppIcon } from '../../components/AppIcon';
import { TextField } from '../../components/TextField';
import { isApiError } from '../../api';
import { errorMessage } from '../../hooks/useApi';
import { requireModerationApi, useAdminQuery } from '../../hooks/useModeration';
import { canChangeRole, canSuspend, roleChangePrompt, when } from '../../lib/moderation';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, spacing } from '../../theme/tokens';
import {
  AuditList,
  ItemCard,
  Label,
  LogList,
  Muted,
  Pill,
  Row,
  Segmented,
  Status,
  Title,
  confirmAction,
  revertAsk,
  type TabProps,
} from './AdminParts';

const ROLE_TONE: Record<UserRole, 'emerald' | 'primary' | 'neutral'> = { ADMIN: 'emerald', CREATOR: 'primary', MEMBER: 'neutral' };
const ROLE_OPTIONS = ADMIN_ROLE_OPTIONS.map((r) => ({ value: r, label: r }));

/** User search (paged) and per-user detail: role, suspension, recent completions, history. */
export function UsersTab(props: TabProps) {
  const [selected, setSelected] = useState<string | null>(null);
  // Bumped after a change in the detail view so the list's role / suspended badges are current.
  const [changes, setChanges] = useState(0);
  // The list stays mounted under the detail so search results and paging survive "back".
  return (
    <>
      {selected ? (
        <UserDetail {...props} id={selected} onBack={() => setSelected(null)} onChanged={() => setChanges((n) => n + 1)} />
      ) : null}
      <View style={selected ? styles.hidden : undefined}>
        <UserList refreshKey={props.refreshKey + changes} viewerId={props.viewerId} onSelect={setSelected} />
      </View>
    </>
  );
}

function UserList({ refreshKey, viewerId, onSelect }: { refreshKey: number; viewerId: string | null; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [items, setItems] = useState<AdminUserListItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async (q: string, after: string | null) => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const r = await requireModerationApi().users(q, after);
      if (id !== seq.current) return;
      setError(null);
      setItems((prev) => (after && prev ? [...prev, ...r.items] : r.items));
      setNext(r.nextAfter);
    } catch (err) {
      if (id !== seq.current || (isApiError(err) && err.code === 'ABORTED')) return;
      setError(errorMessage(err));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(submitted, null);
  }, [load, submitted, refreshKey]);

  const search = () => setSubmitted(normalizeUserSearch(query));

  return (
    <View style={styles.list}>
      <View style={styles.searchRow}>
        <View style={styles.flex}>
          <TextField
            label="Search users"
            placeholder="@handle or name"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={search}
            testID="admin-user-search"
          />
        </View>
        <AppButton label="Search" icon={Search} variant="secondary" onPress={search} style={styles.searchButton} testID="admin-user-search-submit" />
      </View>
      <Status
        error={error}
        loading={loading && !items}
        empty={!!items && items.length === 0}
        emptyText={submitted ? `No users match “${submitted}”.` : 'No users yet.'}
        onRetry={() => void load(submitted, null)}
      />
      {(items ?? []).map((u) => (
        <UserRow key={u.id} user={u} isYou={u.id === viewerId} onPress={() => onSelect(u.id)} />
      ))}
      {next ? (
        <AppButton label="Load more" variant="ghost" loading={loading && !!items} onPress={() => void load(submitted, next)} testID="admin-users-more" />
      ) : null}
    </View>
  );
}

function UserRow({ user: u, isYou, onPress }: { user: AdminUserListItem; isYou: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${u.handle}${isYou ? ' (you)' : ''}, ${u.role}${u.suspended ? ', suspended' : ''}${u.isSystem ? ', system account' : ''}. ${u.username}, ${u.rank}, ${u.auraPoints.toLocaleString()} aura.`}
      accessibilityState={{ disabled: u.isSystem }}
      accessibilityHint={u.isSystem ? 'System accounts cannot be changed.' : 'Opens the user details'}
      disabled={u.isSystem}
      onPress={onPress}
      testID={`admin-user-${u.handle}`}
      style={({ pressed }) => [
        styles.userRow,
        { backgroundColor: colors.bgSurface, borderColor: colors.border, opacity: u.isSystem ? 0.6 : pressed ? 0.75 : 1 },
      ]}
    >
      <View style={styles.flex}>
        <Row>
          <Title>
            {u.handle}
            {isYou ? ' (you)' : ''}
          </Title>
          <Pill label={u.role} tone={ROLE_TONE[u.role]} />
          {u.suspended ? <Pill label="Suspended" tone="orange" /> : null}
          {u.isSystem ? <Pill label="System" /> : null}
        </Row>
        <Muted>
          {u.username} • {u.rank} • {u.auraPoints.toLocaleString()} aura
        </Muted>
      </View>
      {u.isSystem ? null : <AppIcon icon={ChevronRight} size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

function UserDetail({
  id,
  act,
  ask,
  refreshKey,
  viewerId,
  onBack,
  onChanged,
}: TabProps & { id: string; onBack: () => void; onChanged: () => void }) {
  const { colors } = useTheme();
  const load = useCallback(
    (m: ReturnType<typeof requireModerationApi>, signal: AbortSignal) => m.user(id, signal),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, refreshKey]
  );
  const { data, error, loading, reload } = useAdminQuery(load);
  const user = data?.user;
  const p = user?.profile;
  const after = () => {
    void reload();
    onChanged();
  };
  const suspended = !!p && (p.suspended || !!p.suspendedAt);

  const changeRole = (role: UserRole) => {
    if (!p || role === p.role) return;
    confirmAction('Change role?', roleChangePrompt(p.handle, p.role, role), 'Change role', () => {
      void act(() => requireModerationApi().setRole(id, role), (r) => (r.changed ? `Role changed to ${r.role}.` : `Already ${r.role}.`), after);
    }, role !== 'ADMIN' && p.role === 'ADMIN');
  };

  return (
    <View style={styles.list} testID="admin-user-detail">
      <AppButton label="All users" icon={ArrowLeft} variant="ghost" onPress={onBack} style={styles.back} testID="admin-user-back" />
      <Status error={error} loading={loading && !data} empty={false} emptyText="" onRetry={after} />
      {loading && data ? <ActivityIndicator color={colors.primary} accessibilityLabel="Refreshing" /> : null}
      {user && p ? (
        <>
          <ItemCard>
            <Row>
              <Title>
                {p.handle}
                {p.id === viewerId ? ' (you)' : ''}
              </Title>
              <Pill label={p.role} tone={ROLE_TONE[p.role]} />
              {suspended ? <Pill label="Suspended" tone="orange" /> : null}
            </Row>
            <Muted>
              {p.username} • {p.rank} • {p.auraPoints.toLocaleString()} aura • {p.streakDays}-day streak • joined {when(p.createdAt)}
            </Muted>
            {suspended ? (
              <Muted tone="orange">
                Suspended{p.suspendedAt ? ` ${when(p.suspendedAt)}` : ''}
                {p.suspensionReason ? `: ${p.suspensionReason}` : ''}
              </Muted>
            ) : null}
            <Muted>
              {user.counts.questLogs} quests • {user.counts.workoutLogs} workouts • {user.counts.drops} drops ({user.counts.hiddenDrops} hidden) •{' '}
              {user.counts.openReportsOnDrops} open reports on their drops
            </Muted>
            {p.flagsClearedAt ? <Muted>Flags last reviewed {when(p.flagsClearedAt)}</Muted> : null}

            <Label>ROLE</Label>
            <Segmented
              label="Role"
              options={ROLE_OPTIONS}
              value={p.role}
              onChange={changeRole}
              disabled={!canChangeRole(p, viewerId)}
              testIDPrefix="admin-role"
            />
            {!canChangeRole(p, viewerId) ? (
              <Muted>{p.isSystem ? 'System accounts cannot be changed.' : "You can't change your own role."}</Muted>
            ) : null}

            {suspended ? (
              <AppButton
                label="Unsuspend"
                variant="secondary"
                testID="admin-unsuspend"
                onPress={() =>
                  confirmAction('Unsuspend account?', `${p.handle} can play, post and report again.`, 'Unsuspend', () => {
                    void act(() => requireModerationApi().unsuspend(id), 'Account unsuspended.', after);
                  }, false)
                }
              />
            ) : canSuspend({ ...p, suspended }) ? (
              <AppButton
                label="Suspend"
                icon={UserX}
                variant="danger"
                testID="admin-suspend"
                onPress={() =>
                  ask({
                    title: `Suspend ${p.handle}`,
                    description: 'They can still sign in and browse, but quests, workouts, drops, squads and reports are paused.',
                    label: 'Reason (the user sees this)',
                    confirm: 'Suspend',
                    required: true,
                    run: (reason) => act(() => requireModerationApi().suspend(id, reason), 'Account suspended.', after),
                  })
                }
              />
            ) : p.role === 'ADMIN' ? (
              <Muted>Admins can't be suspended. Change the role first.</Muted>
            ) : null}
          </ItemCard>

          <Label>RECENT COMPLETIONS</Label>
          <LogList logs={user.recentLogs} onRevert={(l) => revertAsk(act, ask, id, l, after)} />
          <Label>HISTORY</Label>
          <AuditList items={user.audit} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hidden: { display: 'none' },
  list: {
    gap: spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  searchButton: {
    paddingHorizontal: spacing.md,
  },
  back: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
