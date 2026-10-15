import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
} from 'react-native';
import {
  ICON_KEYS,
  INITIAL_SQUADS,
  INVITE_CODE_LENGTH,
  isInviteCode,
  normalizeInviteCode,
  squadNameError,
  squadTagError,
  SQUAD_WEEKLY_GOAL_MAX,
  SQUAD_WEEKLY_GOAL_MIN,
  weeklyGoalError,
  type IconKey,
  type MySquad,
  type Squad,
} from '@aurafit/shared';
import { Crown, KeyRound, LogOut, Pencil, Plus, RefreshCw, Share2, Trophy, UserMinus, Users } from '../components/icons';
import { AppButton } from '../components/AppButton';
import { AppIcon } from '../components/AppIcon';
import { FormMessage } from '../components/AuthLayout';
import { Avatar } from '../components/Avatar';
import { SampleDataTag } from '../components/DataNotice';
import { ProgressBar } from '../components/ProgressBar';
import { SectionHeader } from '../components/SectionHeader';
import { TextField } from '../components/TextField';
import { useModerationActions } from '../components/moderation/ModerationProvider';
import { ReportButton } from '../components/moderation/ReportButton';
import type { PublicHunter } from '../api/types';
import { siteUrl } from '../config/env';
import { useSquad, type SquadState } from '../hooks/useSquad';
import { canReportSquad } from '../lib/moderation';
import { shortWhen, squadShareContent } from '../lib/squads';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, radius, spacing } from '../theme/tokens';
import { HunterRow } from './AdminScreen';

const STATUS_LABEL: Record<Squad['status'], string> = {
  LOCKED_IN: 'Locked in',
  ON_FIRE: 'On fire',
  NEEDS_SAVING: 'Needs saving',
};

interface Props {
  /** Demo mode: the sample squads (labelled). Signed-in mode: the real squad screen. */
  sample: boolean;
  /** Live top hunters (signed-in mode). */
  hunters: PublicHunter[];
  huntersLoading: boolean;
  huntersError: string | null;
  currentUserId: string;
  onRetry: () => void;
  onOpenLeaderboard: () => void;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Invite code from an aurafit://join/<CODE> link, waiting for confirmation. */
  joinCode?: string | null;
  onJoinCodeHandled?: () => void;
  /** Changes when the user's aura changes, so weekly progress refreshes. */
  refreshKey?: number;
}

type Form = null | 'create' | 'join' | 'edit';

export function GuildScreen({
  sample,
  hunters,
  huntersLoading,
  huntersError,
  currentUserId,
  onRetry,
  onOpenLeaderboard,
  refreshControl,
  joinCode = null,
  onJoinCodeHandled,
  refreshKey,
}: Props) {
  const { colors } = useTheme();
  const top = hunters.slice(0, 5);
  const squad = useSquad(!sample, refreshKey);
  const [form, setForm] = useState<Form>(null);

  // Refresh the live boards each time the tab is opened.
  useEffect(() => {
    if (!sample) onRetry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Android back closes an open form before the shell's tab handling.
  useEffect(() => {
    if (!form) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setForm(null);
      return true;
    });
    return () => sub.remove();
  }, [form]);

  return (
    <ScrollView
      testID="guild-screen"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      <SectionHeader icon={Users} title="Hunter Guild" subtitle="Train together. Hit the weekly goal as a squad." />

      {sample ? (
        <>
          {joinCode ? (
            <InfoCard
              title="Squad invite"
              body={`Sign in to join a squad with code ${joinCode}. Squads are not available in demo mode.`}
            />
          ) : null}
          <SampleDataTag />
          {INITIAL_SQUADS.map((s) => (
            <View
              key={s.id}
              accessible
              accessibilityLabel={`Sample data. Number ${s.rankPosition}: ${s.name}. ${s.memberCount} of ${s.maxMembers} members. ${s.totalAura.toLocaleString()} aura. Weekly goal ${s.weeklyGoalProgress} percent. ${STATUS_LABEL[s.status]}.`}
              style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}
            >
              <View style={styles.row}>
                <Text style={[styles.pos, { color: colors.orange }]}>#{s.rankPosition}</Text>
                <SquadEmblem icon={s.avatar} />
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
        <LiveSquad state={squad} form={form} setForm={setForm} joinCode={joinCode} onJoinCodeHandled={onJoinCodeHandled} />
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

function SquadEmblem({ icon, size = 36 }: { icon: IconKey; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.emblem, { width: size, height: size, backgroundColor: colors.pinkSubtle }]}>
      <AppIcon name={icon} size={size * 0.55} color={colors.pink} />
    </View>
  );
}

function InfoCard({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
      <Text style={[styles.name, { color: colors.textPrimary }]} accessibilityRole="header">
        {title}
      </Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text>
      {children}
    </View>
  );
}

function LiveSquad({
  state,
  form,
  setForm,
  joinCode,
  onJoinCodeHandled,
}: {
  state: SquadState;
  form: Form;
  setForm: (f: Form) => void;
  joinCode: string | null;
  onJoinCodeHandled?: () => void;
}) {
  const { colors } = useTheme();
  const { squad } = state;

  if (squad === undefined) {
    return state.error ? (
      <>
        <FormMessage tone="error" message={state.error} />
        <AppButton label="Try again" variant="secondary" onPress={() => void state.refresh()} testID="squad-retry" />
      </>
    ) : (
      <ActivityIndicator color={colors.primary} accessibilityLabel="Loading your squad" />
    );
  }

  return (
    <>
      {joinCode ? <JoinInvite state={state} code={joinCode} onDone={() => onJoinCodeHandled?.()} /> : null}
      {squad === null ? (
        form === 'create' ? (
          <CreateForm state={state} onClose={() => setForm(null)} />
        ) : form === 'join' ? (
          <JoinForm state={state} onClose={() => setForm(null)} />
        ) : joinCode ? null : (
          <InfoCard
            title="Train as a squad"
            body="Team up with up to 4 friends, hit a weekly aura goal together and climb the squad leaderboard."
          >
            <AppButton label="Create squad" icon={Plus} onPress={() => setForm('create')} testID="squad-create" />
            <AppButton label="Join with code" icon={KeyRound} variant="secondary" onPress={() => setForm('join')} testID="squad-join" />
          </InfoCard>
        )
      ) : form === 'edit' && squad.isLeader ? (
        <EditForm state={state} squad={squad} onClose={() => setForm(null)} />
      ) : (
        <SquadView state={state} squad={squad} onEdit={() => setForm('edit')} />
      )}
      <SquadBoard state={state} />
    </>
  );
}

function JoinInvite({ state, code, onDone }: { state: SquadState; code: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (state.squad) {
    return (
      <InfoCard title="Squad invite" body={`You're already in ${state.squad.name}. Leave it first to join with code ${code}.`}>
        <AppButton label="OK" variant="secondary" onPress={onDone} testID="squad-invite-dismiss" />
      </InfoCard>
    );
  }
  return (
    <View testID="squad-join-confirm">
      <InfoCard title="Join this squad?" body={`You were invited with code ${code}. Squads share a weekly aura goal.`}>
        {error ? <FormMessage tone="error" message={error} /> : null}
        <AppButton
          label="Join squad"
          icon={KeyRound}
          loading={busy}
          testID="squad-join-confirm-button"
          onPress={async () => {
            setBusy(true);
            const err = await state.join(code);
            setBusy(false);
            if (err) setError(err);
            else onDone();
          }}
        />
        <AppButton label="Not now" variant="ghost" onPress={onDone} />
      </InfoCard>
    </View>
  );
}

function IconPicker({ value, onChange }: { value: IconKey; onChange: (k: IconKey) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.iconGrid} accessibilityRole="radiogroup" accessibilityLabel="Squad icon">
      {ICON_KEYS.map((k) => {
        const on = k === value;
        return (
          <Pressable
            key={k}
            accessibilityRole="radio"
            accessibilityLabel={k}
            accessibilityState={{ checked: on }}
            onPress={() => onChange(k)}
            style={[
              styles.iconOption,
              { borderColor: on ? colors.borderFocus : colors.border, backgroundColor: on ? colors.primarySubtle : colors.bgInput },
            ]}
          >
            <AppIcon name={k} size={20} color={on ? colors.primary : colors.textSecondary} />
          </Pressable>
        );
      })}
    </View>
  );
}

function CreateForm({ state, onClose }: { state: SquadState; onClose: () => void }) {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [icon, setIcon] = useState<IconKey>('swords');
  const [errors, setErrors] = useState<{ name?: string; tag?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  return (
    <InfoCard title="Create a squad" body="You'll lead it and get an invite code to share.">
      {errors.form ? <FormMessage tone="error" message={errors.form} /> : null}
      <TextField label="Squad name" value={name} onChangeText={setName} error={errors.name} autoCorrect={false} testID="squad-name" />
      <TextField
        label="Tag (2-6 letters or digits)"
        value={tag}
        onChangeText={(t) => setTag(t.toUpperCase())}
        error={errors.tag}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={7}
        testID="squad-tag"
      />
      <IconPicker value={icon} onChange={setIcon} />
      <AppButton
        label="Create squad"
        loading={busy}
        testID="squad-create-submit"
        onPress={async () => {
          const local = { name: squadNameError(name) ?? undefined, tag: squadTagError(tag) ?? undefined };
          if (local.name || local.tag) return setErrors(local);
          setBusy(true);
          const err = await state.create({ name, tag, icon });
          setBusy(false);
          if (err) setErrors({ form: err });
          else onClose();
        }}
      />
      <AppButton label="Cancel" variant="ghost" onPress={onClose} />
    </InfoCard>
  );
}

function JoinForm({ state, onClose }: { state: SquadState; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  return (
    <InfoCard title="Join a squad" body="Enter the invite code your squad leader shared.">
      <TextField
        label="Invite code"
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        error={error}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={INVITE_CODE_LENGTH + 4}
        testID="squad-code"
      />
      <AppButton
        label="Join squad"
        loading={busy}
        testID="squad-join-submit"
        onPress={async () => {
          const normalized = normalizeInviteCode(code);
          if (!isInviteCode(normalized)) return setError(`Invite codes are ${INVITE_CODE_LENGTH} letters and digits.`);
          setBusy(true);
          const err = await state.join(normalized);
          setBusy(false);
          if (err) setError(err);
          else onClose();
        }}
      />
      <AppButton label="Cancel" variant="ghost" onPress={onClose} />
    </InfoCard>
  );
}

function EditForm({ state, squad, onClose }: { state: SquadState; squad: MySquad; onClose: () => void }) {
  const [name, setName] = useState(squad.name);
  const [icon, setIcon] = useState<IconKey>(squad.icon);
  const [goal, setGoal] = useState(squad.weeklyGoal === null ? '' : String(squad.weeklyGoal));
  const [errors, setErrors] = useState<{ name?: string; goal?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  return (
    <InfoCard title="Edit squad" body={`Leave the goal empty for the automatic goal (5,000 per member).`}>
      {errors.form ? <FormMessage tone="error" message={errors.form} /> : null}
      <TextField label="Squad name" value={name} onChangeText={setName} error={errors.name} />
      <IconPicker value={icon} onChange={setIcon} />
      <TextField
        label={`Weekly goal (${SQUAD_WEEKLY_GOAL_MIN.toLocaleString()}-${SQUAD_WEEKLY_GOAL_MAX.toLocaleString()})`}
        value={goal}
        onChangeText={setGoal}
        keyboardType="number-pad"
        placeholder={`Automatic: ${squad.progress.goal.toLocaleString()}`}
        error={errors.goal}
        testID="squad-goal"
      />
      <AppButton
        label="Save changes"
        loading={busy}
        testID="squad-edit-save"
        onPress={async () => {
          const weeklyGoal = goal.trim() === '' ? null : Number(goal.trim());
          const local = { name: squadNameError(name) ?? undefined, goal: weeklyGoalError(weeklyGoal) ?? undefined };
          if (local.name || local.goal) return setErrors(local);
          const patch: { name?: string; icon?: IconKey; weeklyGoal?: number | null } = {};
          if (name.trim().replace(/\s+/g, ' ') !== squad.name) patch.name = name;
          if (icon !== squad.icon) patch.icon = icon;
          if (weeklyGoal !== squad.weeklyGoal) patch.weeklyGoal = weeklyGoal;
          if (Object.keys(patch).length === 0) return onClose();
          setBusy(true);
          const err = await state.update(patch);
          setBusy(false);
          if (err) setErrors({ form: err });
          else onClose();
        }}
      />
      <AppButton label="Cancel" variant="ghost" onPress={onClose} />
    </InfoCard>
  );
}

function confirm(title: string, message: string, action: string, destructive: boolean, run: () => Promise<string | null>) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: action,
      style: destructive ? 'destructive' : 'default',
      onPress: () => {
        void run().then((err) => {
          if (err) Alert.alert('Something went wrong', err);
        });
      },
    },
  ]);
}

function SquadView({ state, squad, onEdit }: { state: SquadState; squad: MySquad; onEdit: () => void }) {
  const { colors } = useTheme();
  const { progress } = squad;

  const share = async () => {
    const content = squadShareContent(squad, siteUrl);
    if (!content) return;
    try {
      await Share.share({ title: content.title, message: content.message, url: content.url }, { dialogTitle: content.title });
    } catch {
      Alert.alert("Couldn't open the share sheet", `Invite code: ${squad.inviteCode}`);
    }
  };

  return (
    <View testID="squad-view" style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
      <View style={styles.row}>
        <SquadEmblem icon={squad.icon} size={48} />
        <View style={styles.flex}>
          <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
            {squad.name} <Text style={{ color: colors.textMuted }}>[{squad.tag}]</Text>
          </Text>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            {squad.memberCount}/{squad.maxMembers} hunters{squad.rank ? ` • #${squad.rank} this week` : ''}
          </Text>
        </View>
        {squad.isLeader ? <AppIcon icon={Crown} size={20} color={colors.orange} accessibilityLabel="You lead this squad" /> : null}
      </View>

      <View style={styles.goal}>
        <View style={styles.rowBetween}>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>Weekly goal{progress.goalIsCustom ? '' : ' (automatic)'}</Text>
          <Text style={[styles.muted, { color: colors.pink, fontWeight: '800' }]}>{progress.percent}%</Text>
        </View>
        <ProgressBar
          value={progress.percent}
          label={`Weekly goal: ${progress.aura.toLocaleString()} of ${progress.goal.toLocaleString()} aura, ${progress.percent} percent`}
        />
        <View style={styles.rowBetween}>
          <Text style={[styles.muted, { color: colors.textPrimary, fontWeight: '800' }]}>
            {progress.aura.toLocaleString()} / {progress.goal.toLocaleString()} aura
          </Text>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            {progress.daysLeft} {progress.daysLeft === 1 ? 'day' : 'days'} left
          </Text>
        </View>
      </View>

      <Text style={[styles.label, { color: colors.textSecondary }]} accessibilityRole="header">
        MEMBERS THIS WEEK
      </Text>
      {squad.members.map((m) => (
        <View
          key={m.profileId}
          style={[styles.member, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}
          testID={`squad-member-${m.handle}`}
        >
          <Avatar name={m.username} url={m.avatarUrl} size={36} />
          <View
            style={styles.flex}
            accessible
            accessibilityLabel={`${m.username}${m.isYou ? ' (you)' : ''}${m.role === 'LEADER' ? ', leader' : ''}, ${m.handle}. ${m.weeklyAura.toLocaleString()} aura this week.`}
          >
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {m.username}
              {m.isYou ? ' (you)' : ''}
              {m.role === 'LEADER' ? ' • Leader' : ''}
            </Text>
            <Text style={[styles.muted, { color: colors.textSecondary }]} numberOfLines={1}>
              {m.handle} • {m.rank}
            </Text>
          </View>
          <Text style={[styles.aura, { color: colors.primary }]}>{m.weeklyAura.toLocaleString()}</Text>
          {squad.isLeader && !m.isYou ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${m.handle} from the squad`}
              hitSlop={8}
              style={styles.iconButton}
              onPress={() =>
                confirm('Remove member?', `${m.handle} will leave the squad. They can rejoin with an invite code.`, 'Remove', true, () =>
                  state.remove(m.profileId)
                )
              }
            >
              <AppIcon icon={UserMinus} size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      ))}

      {squad.isLeader && squad.inviteCode ? (
        <View style={[styles.invite, { borderColor: colors.border, backgroundColor: colors.bgElevated }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>INVITE CODE</Text>
          <Text
            selectable
            testID="squad-invite-code"
            accessibilityLabel={`Invite code ${squad.inviteCode.split('').join(' ')}`}
            style={[styles.code, { color: colors.textPrimary }]}
          >
            {squad.inviteCode}
          </Text>
          <AppButton label="Share invite" icon={Share2} onPress={() => void share()} testID="squad-share" />
          <AppButton
            label="New invite code"
            icon={RefreshCw}
            variant="secondary"
            onPress={() => confirm('Make a new invite code?', 'The current code and link stop working immediately.', 'New code', false, state.regenerate)}
          />
          <AppButton label="Edit squad" icon={Pencil} variant="secondary" onPress={onEdit} testID="squad-edit" />
        </View>
      ) : (
        <Text style={[styles.muted, { color: colors.textSecondary }]}>Want to invite someone? Ask your squad leader for the invite link.</Text>
      )}

      <AppButton
        label="Leave squad"
        icon={LogOut}
        variant="ghost"
        testID="squad-leave"
        onPress={() =>
          confirm(
            'Leave squad?',
            squad.memberCount <= 1
              ? 'You are the last member, so the squad will be deleted.'
              : squad.isLeader
                ? 'Leadership passes to the longest-standing member.'
                : 'Your aura this week stops counting for this squad.',
            'Leave',
            true,
            state.leave
          )
        }
      />

      <Text style={[styles.label, { color: colors.textSecondary }]} accessibilityRole="header">
        SQUAD ACTIVITY
      </Text>
      {state.feed === null ? (
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading squad activity" />
      ) : state.feed.length === 0 ? (
        <Text style={[styles.muted, { color: colors.textSecondary }]}>No completions yet this week. Be the first.</Text>
      ) : (
        state.feed.map((i) => (
          <View key={i.id} accessible style={styles.feedRow}>
            <Text style={[styles.body, styles.flex, { color: colors.textPrimary }]}>
              <Text style={{ fontWeight: '800' }}>{i.isYou ? 'You' : i.handle}</Text> finished {i.title}
              <Text style={{ color: colors.textMuted }}> • {shortWhen(i.completedAt)}</Text>
            </Text>
            <Text style={[styles.aura, { color: colors.primary }]}>+{i.aura}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function SquadBoard({ state }: { state: SquadState }) {
  const { colors } = useTheme();
  // Report other squads (signed in only; hidden until the viewer's own squad is known).
  const moderation = useModerationActions();
  const mySquadId = state.squad === undefined ? undefined : (state.squad?.id ?? null);
  return (
    <>
      <SectionHeader icon={Trophy} title="Squad leaderboard" subtitle="This week, since Monday 00:00 UTC" />
      {state.board === null ? (
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading squad leaderboard" />
      ) : state.board.length === 0 ? (
        <Text style={[styles.muted, { color: colors.textSecondary }]}>No squads yet this week.</Text>
      ) : (
        state.board.map((s) => {
          const mine = s.id === state.squad?.id;
          const reportable = !!moderation && canReportSquad(s.id, mySquadId);
          return (
            <View
              key={s.id}
              style={[
                styles.member,
                { backgroundColor: mine ? colors.primarySubtle : colors.bgSurface, borderColor: mine ? colors.primary : colors.border },
              ]}
            >
              <View
                accessible
                accessibilityLabel={`Number ${s.rank}: ${s.name}${mine ? ' (your squad)' : ''}. ${s.memberCount} of ${s.maxMembers} hunters. ${s.weeklyAura.toLocaleString()} aura this week.`}
                style={[styles.row, styles.flex]}
              >
                <Text style={[styles.pos, { color: colors.orange }]}>#{s.rank}</Text>
                <SquadEmblem icon={s.icon} />
                <View style={styles.flex}>
                  <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                    {s.name} <Text style={{ color: colors.textMuted }}>[{s.tag}]</Text>
                  </Text>
                  <Text style={[styles.muted, { color: colors.textSecondary }]}>
                    {s.memberCount}/{s.maxMembers} hunters
                  </Text>
                </View>
                <Text style={[styles.aura, { color: colors.primary }]}>{s.weeklyAura.toLocaleString()}</Text>
              </View>
              {reportable ? (
                <ReportButton
                  compact
                  testID={`squad-report-${s.tag}`}
                  accessibilityLabel={`Report squad ${s.name}`}
                  onPress={() => moderation?.reportSquad(s)}
                />
              ) : null}
            </View>
          );
        })
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  card: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  goal: {
    gap: spacing.xs,
  },
  pos: {
    fontSize: fontSize.body,
    fontWeight: '900',
    minWidth: 28,
  },
  emblem: {
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  name: {
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  body: {
    fontSize: fontSize.caption + 1,
  },
  muted: {
    fontSize: fontSize.caption,
  },
  label: {
    fontSize: fontSize.caption - 1,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  aura: {
    fontSize: fontSize.caption + 1,
    fontWeight: '900',
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  iconButton: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invite: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: spacing.sm,
  },
  code: {
    fontSize: fontSize.headline + 4,
    fontWeight: '900',
    letterSpacing: 4,
    textAlign: 'center',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  iconOption: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
