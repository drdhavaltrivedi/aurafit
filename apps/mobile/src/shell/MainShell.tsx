import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, RefreshControl, StyleSheet, View } from 'react-native';
import { hasPermission, rankLabel, type HunterRank, type Quest, type UserProfile, type UserRole, type WorkoutDrop } from '@aurafit/shared';
import { AppHeader } from '../components/AppHeader';
import { BottomTabBar, type MainTabKey } from '../components/BottomTabBar';
import { SampleDataTag } from '../components/DataNotice';
import { Toast, type ToastMessage } from '../components/Toast';
import { WorkoutSessionModal } from '../components/WorkoutSessionModal';
import { useActivityFeed } from '../hooks/useActivityFeed';
import { useNotificationRouting } from '../hooks/useNotificationRouting';
import { usePushRegistration } from '../hooks/usePushRegistration';
import { useSquadJoinLink } from '../hooks/useSquadJoinLink';
import { useShareCard } from '../hooks/useShareCard';
import { diffProfileEvents } from '../lib/activity';
import type { ProfilePatch } from '../lib/profile';
import { AchievementsScreen } from '../screens/AchievementsScreen';
import { AdminScreen } from '../screens/AdminScreen';
import { CreatorScreen } from '../screens/CreatorScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { GuildScreen } from '../screens/GuildScreen';
import { HunterCardScreen } from '../screens/HunterCardScreen';
import { LeaderboardScreen, type LeaderboardData } from '../screens/LeaderboardScreen';
import { MemberScreen, type QuickActionKey } from '../screens/MemberScreen';
import { MovementSnacksScreen } from '../screens/MovementSnacksScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { QuestsScreen } from '../screens/QuestsScreen';
import { AccountScreen } from '../screens/account/AccountScreen';
import { useTheme, type ThemePreference } from '../theme/ThemeProvider';

export interface QuestResult {
  auraEarned: number;
  stat: string;
  amount: number;
}

/** Everything the shell needs from a data source (demo store or the AuraFit API). */
export interface ShellModel {
  demo: boolean;
  /** Activity-feed storage scope (`demo`, or the profile id). */
  activityScope: string;
  role: UserRole;
  user: UserProfile;
  email: string | null;
  quests: Quest[];
  drops: WorkoutDrop[];
  dropsLoading: boolean;
  dropsError: string | null;
  leaderboard: LeaderboardData;
  /** Error notice above home content (server sync problems). */
  homeHeader?: React.ReactNode;
  /** Demo banner + role switcher. */
  topSlot?: React.ReactNode;
  refresh?: { refreshing: boolean; onRefresh: () => void };
  completeQuest: (questId: string) => Promise<QuestResult | null>;
  claimWorkout: (drop: WorkoutDrop) => Promise<{ auraEarned: number } | null>;
  saveProfile: (patch: ProfilePatch) => Promise<{ error?: string }>;
  resetLocalData: () => void;
  themePreference: ThemePreference;
  setTheme: (p: ThemePreference) => void;
  toggleTheme: () => void;
  /** Opens this drop's workout session once it is in `drops` (e.g. "Start now" after onboarding). */
  initialWorkoutId?: string | null;
}

type Overlay = 'settings' | 'notifications' | 'editProfile' | 'hunterCard' | 'leaderboard' | 'achievements';

export function MainShell({ model }: { model: ShellModel }) {
  const { colors } = useTheme();
  const { demo, role, user, quests, drops } = model;
  const activity = useActivityFeed(model.activityScope);
  const [tab, setTab] = useState<MainTabKey>('home');
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDrop | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const overlay = overlays[overlays.length - 1] ?? null;

  const open = useCallback((o: Overlay) => setOverlays((s) => [...s, o]), []);
  const close = useCallback(() => setOverlays((s) => s.slice(0, -1)), []);
  // A rank-up toast (it has a "Share card" action) is not replaced by the quest/workout toast
  // that arrives right after it.
  const showToast = useCallback(
    (text: string, action?: ToastMessage['action']) =>
      setToast((prev) => (!action && prev?.action && Date.now() - prev.id < 2000 ? prev : { id: Date.now(), text, action })),
    []
  );

  // Rank card sharing (signed in only; demo profiles are not public).
  const shareCard = useShareCard(user, demo);
  const shareRef = useRef(shareCard.share);
  shareRef.current = shareCard.share;
  const shareRankUp = useCallback((rank?: HunterRank) => void shareRef.current(rank), []);
  const onCardScreen = overlays[overlays.length - 1] === 'hunterCard' || (overlays.length === 0 && tab === 'profile');
  // Errors from the toast / notification prompts (the hunter card screen shows its own inline).
  const { error: shareError, clearError: clearShareError } = shareCard;
  useEffect(() => {
    if (!shareError || onCardScreen) return;
    Alert.alert('Share card', shareError);
    clearShareError();
  }, [shareError, onCardScreen, clearShareError]);

  // Push reminders: server settings + this device's token (signed in only), and routing for
  // taps on aurafit://quests notifications.
  usePushRegistration(demo ? null : user.id);
  useNotificationRouting(
    useCallback(() => {
      setOverlays([]);
      setTab('quests');
    }, [])
  );
  // Squad invites (aurafit://join/<CODE>) open the Guild tab with a join confirmation.
  const [joinCode, setJoinCode] = useState<string | null>(null);
  useSquadJoinLink(
    useCallback((code: string) => {
      setOverlays([]);
      setTab('guild');
      setJoinCode(code);
    }, [])
  );
  const dismissToast = useCallback(() => setToast(null), []);

  // Android back: close the top overlay, then return to Home, then let the OS exit.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (overlays.length > 0) {
        close();
        return true;
      }
      if (tab !== 'home') {
        setTab('home');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [overlays.length, tab, close]);

  // Rank-ups, streak milestones and shields spent, derived from real profile changes.
  const { log } = activity;
  const prevUser = useRef<UserProfile | null>(null);
  useEffect(() => {
    if (!activity.loaded) return;
    const events = diffProfileEvents(prevUser.current, user);
    prevUser.current = user;
    if (events.length) log(...events);
    if (!demo && events.some((e) => e.kind === 'rank')) {
      const rank = user.rank;
      showToast(`You ranked up to ${rankLabel(rank)}!`, { label: 'Share card', onPress: () => shareRankUp(rank) });
    }
  }, [user, activity.loaded, log, demo, showToast, shareRankUp]);

  // One welcome entry the first time a feed is created for this user/mode.
  const welcomed = useRef(false);
  useEffect(() => {
    if (!activity.loaded || welcomed.current) return;
    welcomed.current = true;
    if (activity.feed.items.length === 0 && activity.feed.lastReadAt === 0) {
      log({
        kind: 'account',
        title: demo ? 'Demo mode started' : 'Welcome to AuraFit',
        body: demo
          ? 'Explore with sample data. Progress stays on this device.'
          : `Signed in${model.email ? ` as ${model.email}` : ''}. Complete quests to earn aura.`,
      });
    }
  }, [activity.loaded, activity.feed, demo, model.email, log]);

  const { completeQuest, claimWorkout } = model;
  const onCompleteQuest = useCallback(
    async (questId: string) => {
      const quest = quests.find((q) => q.id === questId);
      const res = await completeQuest(questId);
      if (!res || !quest) return;
      const statText = `+${res.amount} ${res.stat.toUpperCase()}`;
      showToast(`Quest complete! +${res.auraEarned} aura, ${statText}`);
      log({ kind: 'quest', title: `Completed "${quest.title}"`, body: `Earned ${res.auraEarned} aura and ${statText}.` });
    },
    [quests, completeQuest, showToast, log]
  );

  const startWorkout = useCallback(
    (drop: WorkoutDrop) => {
      if (hasPermission(role, 'START_WORKOUT')) setActiveWorkout(drop);
    },
    [role]
  );
  const closeWorkout = useCallback(() => setActiveWorkout(null), []);

  const startedInitial = useRef<string | null>(null);
  useEffect(() => {
    const id = model.initialWorkoutId;
    if (!id || startedInitial.current === id) return;
    const drop = drops.find((d) => d.id === id);
    if (!drop) return;
    startedInitial.current = id;
    startWorkout(drop);
  }, [model.initialWorkoutId, drops, startWorkout]);
  const onClaimWorkout = useCallback(
    async (drop: WorkoutDrop) => {
      setActiveWorkout(null);
      const res = await claimWorkout(drop);
      if (!res) return;
      showToast(`Workout complete! +${res.auraEarned} aura`);
      log({ kind: 'workout', title: `Finished "${drop.title}"`, body: `Earned ${res.auraEarned} aura (${drop.auraMultiplier}x multiplier).` });
    },
    [claimWorkout, showToast, log]
  );

  const { saveProfile } = model;
  const onSaveProfile = useCallback(
    async (patch: ProfilePatch) => {
      const res = await saveProfile(patch);
      if (!res.error) log({ kind: 'account', title: 'Profile updated', body: `You're now "${patch.username}".` });
      return res;
    },
    [saveProfile, log]
  );

  const { resetLocalData } = model;
  const onResetLocalData = useCallback(() => {
    resetLocalData();
    activity.clear();
    if (demo) log({ kind: 'account', title: 'Demo data reset', body: 'Your demo progress went back to the starting sample.' });
  }, [resetLocalData, activity, demo, log]);

  const onQuickAction = useCallback(
    (key: QuickActionKey) => {
      if (key === 'snacks') setTab('workouts');
      else if (key === 'guild') setTab('guild');
      else if (key === 'hunter_card') open('hunterCard');
      else if (key === 'leaderboard') open('leaderboard');
      else open('achievements');
    },
    [open]
  );

  const refreshControl = model.refresh ? (
    <RefreshControl
      refreshing={model.refresh.refreshing}
      onRefresh={model.refresh.onRefresh}
      tintColor={colors.primary}
      colors={[colors.primaryStrong]}
    />
  ) : undefined;

  // ---- Full-screen overlays ----
  if (overlay === 'settings') {
    return (
      <AccountScreen
        demo={demo}
        email={model.email}
        profile={user}
        onClose={close}
        onResetLocalData={onResetLocalData}
        themePreference={model.themePreference}
        onSetTheme={model.setTheme}
        onEditProfile={() => open('editProfile')}
      />
    );
  }
  if (overlay === 'notifications') {
    return (
      <NotificationsScreen
        activity={activity}
        demo={demo}
        onBack={close}
        onShareRank={shareCard.enabled ? () => shareRankUp() : undefined}
        shareLoading={shareCard.loading}
      />
    );
  }
  if (overlay === 'editProfile') {
    return <EditProfileScreen profile={user} demo={demo} onSave={onSaveProfile} onBack={close} />;
  }
  if (overlay === 'hunterCard') {
    return (
      <HunterCardScreen
        user={user}
        demo={demo}
        onBack={close}
        onEditProfile={() => open('editProfile')}
        onOpenAchievements={() => open('achievements')}
        share={shareCard}
      />
    );
  }
  if (overlay === 'leaderboard') {
    return <LeaderboardScreen data={model.leaderboard} currentUserId={user.id} onBack={close} />;
  }
  if (overlay === 'achievements') {
    return <AchievementsScreen user={user} demo={demo} onBack={close} />;
  }

  const canDoQuests = hasPermission(role, 'DO_QUESTS');
  const canStart = hasPermission(role, 'START_WORKOUT');

  return (
    <>
      <AppHeader
        onToggleTheme={model.toggleTheme}
        onOpenSettings={() => open('settings')}
        onOpenNotifications={() => open('notifications')}
        unreadCount={activity.unread}
      />
      {model.topSlot}
      <View style={styles.body}>
        {tab === 'home' && role === 'MEMBER' ? (
          <MemberScreen
            role={role}
            user={user}
            quests={quests}
            drops={drops}
            sampleDrops={demo}
            dropsLoading={model.dropsLoading}
            onCompleteQuest={onCompleteQuest}
            onStartWorkout={startWorkout}
            header={model.homeHeader}
            refreshControl={refreshControl}
            onQuickAction={onQuickAction}
            onOpenQuests={() => setTab('quests')}
            onOpenWorkouts={() => setTab('workouts')}
            onEditProfile={() => open('editProfile')}
            onOpenHunterCard={() => open('hunterCard')}
          />
        ) : null}
        {tab === 'home' && role === 'CREATOR' ? (
          demo ? (
            <CreatorScreen role={role} sample />
          ) : (
            <CreatorScreen
              role={role}
              sample={false}
              profile={user}
              drops={drops}
              dropsLoading={model.dropsLoading}
              dropsError={model.dropsError}
            />
          )
        ) : null}
        {tab === 'home' && role === 'ADMIN' ? (
          demo ? (
            <AdminScreen role={role} sample />
          ) : (
            <AdminScreen
              role={role}
              sample={false}
              hunters={model.leaderboard.hunters}
              huntersLoading={model.leaderboard.loading}
              huntersError={model.leaderboard.error}
              onRetry={model.leaderboard.refetch}
            />
          )
        ) : null}
        {tab === 'quests' ? (
          <QuestsScreen
            quests={quests}
            canComplete={canDoQuests}
            onComplete={onCompleteQuest}
            refreshControl={refreshControl}
            header={demo ? <SampleDataTag /> : model.homeHeader}
          />
        ) : null}
        {tab === 'workouts' ? (
          <MovementSnacksScreen
            quests={quests}
            drops={drops}
            canComplete={canDoQuests}
            canStart={canStart}
            onCompleteQuest={onCompleteQuest}
            onStartWorkout={startWorkout}
            sample={demo}
            dropsLoading={model.dropsLoading}
            dropsError={model.dropsError}
            refreshControl={refreshControl}
          />
        ) : null}
        {tab === 'guild' ? (
          <GuildScreen
            sample={demo}
            hunters={model.leaderboard.hunters}
            huntersLoading={model.leaderboard.loading}
            huntersError={model.leaderboard.error}
            currentUserId={user.id}
            onRetry={model.leaderboard.refetch}
            onOpenLeaderboard={() => open('leaderboard')}
            joinCode={joinCode}
            onJoinCodeHandled={() => setJoinCode(null)}
            refreshKey={user.auraPoints}
            refreshControl={
              demo ? undefined : (
                <RefreshControl
                  refreshing={!!model.leaderboard.refreshing}
                  onRefresh={model.leaderboard.refetch}
                  tintColor={colors.primary}
                />
              )
            }
          />
        ) : null}
        {tab === 'profile' ? (
          <HunterCardScreen
            user={user}
            demo={demo}
            onEditProfile={() => open('editProfile')}
            onOpenAchievements={() => open('achievements')}
            share={shareCard}
          />
        ) : null}
        <Toast toast={toast} onDismiss={dismissToast} />
      </View>

      <BottomTabBar activeTab={tab} onSelectTab={setTab} />

      <WorkoutSessionModal drop={activeWorkout} onClose={closeWorkout} onClaim={(d) => void onClaimWorkout(d)} />
    </>
  );
}

/** Shows the standard "already claimed" alert (used by the demo data source). */
export function alertAlreadyClaimed() {
  Alert.alert('Already claimed today', 'You already completed this quest today. Come back tomorrow!');
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
});
