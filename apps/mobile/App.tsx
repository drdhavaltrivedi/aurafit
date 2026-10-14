import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import {
  ADMIN_USER,
  CREATOR_USER,
  INITIAL_WORKOUT_DROPS,
  calculateAuraGain,
  getRankFromAura,
  hasPermission,
  type UserRole,
} from '@aurafit/shared';
import type { PublicHunter } from './src/api/types';
import { updateOwnProfile } from './src/api/profile';
import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { AppButton } from './src/components/AppButton';
import { FormMessage } from './src/components/AuthLayout';
import { DemoBanner } from './src/components/DemoBanner';
import { RoleSwitcher } from './src/components/RoleSwitcher';
import { useCompleteQuest, useCompleteWorkout, useDrops, useLeaderboard, useMe } from './src/hooks/useApi';
import { useDemoIntro } from './src/hooks/useDemoIntro';
import { useGameStore, type GameStore } from './src/hooks/useGameStore';
import { needsOnboarding } from './src/lib/onboarding';
import { AuthNavigator } from './src/screens/auth/AuthNavigator';
import { ResetPasswordScreen } from './src/screens/auth/ResetPasswordScreen';
import { DemoIntroScreen } from './src/screens/onboarding/DemoIntroScreen';
import { OnboardingScreen } from './src/screens/onboarding/OnboardingScreen';
import { MainShell, alertAlreadyClaimed, type ShellModel } from './src/shell/MainShell';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { spacing } from './src/theme/tokens';

// Keep the native splash up until persisted state and the auth session are loaded, so users
// never see default data or the welcome screen flash before their saved state.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden (e.g. fast refresh) */
});

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  // The local store always runs: it owns the theme preference in every mode, and all game
  // state in demo mode.
  const store = useGameStore();
  const auth = useAuth();
  const ready = store.hydrated && auth.status !== 'loading';

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  return (
    <ThemeProvider preference={store.state.themePreference}>{ready ? <Screens store={store} /> : null}</ThemeProvider>
  );
}

function Screens({ store }: { store: GameStore }) {
  const { colors, isDark } = useTheme();
  const auth = useAuth();

  // Root view colour shows behind the keyboard, modals and during rotation.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bgPage).catch(() => {});
  }, [colors.bgPage]);

  const { setTheme } = store;
  const toggleTheme = useCallback(() => setTheme(isDark ? 'light' : 'dark'), [isDark, setTheme]);

  let content: React.ReactNode;
  if (auth.recoveryPending && auth.session) content = <ResetPasswordScreen />;
  else if (auth.status === 'signedIn') content = <ServerShell store={store} onToggleTheme={toggleTheme} />;
  else if (auth.status === 'demo') content = <DemoShell store={store} onToggleTheme={toggleTheme} />;
  else content = <AuthNavigator />;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPage }]} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {content}
    </SafeAreaView>
  );
}

/** Local-only experience (seed data + AsyncStorage reducer), clearly labelled as sample data. */
function DemoShell({ store, onToggleTheme }: { store: GameStore; onToggleTheme: () => void }) {
  const auth = useAuth();
  const { state, setRole, completeQuest, finishWorkout, resetGame, setTheme, updateProfile } = store;
  const { role, user, quests } = state;
  const intro = useDemoIntro();

  const leaderboard = useMemo(() => {
    const hunters: PublicHunter[] = [user, CREATOR_USER, ADMIN_USER]
      .map((u) => ({
        id: u.id,
        username: u.username,
        handle: u.handle,
        avatarUrl: u.avatarUrl,
        role: u.role,
        auraPoints: u.auraPoints,
        rank: getRankFromAura(u.auraPoints).rank,
        level: u.level,
        streakDays: u.streakDays,
        totalWorkouts: u.totalWorkouts,
      }))
      .sort((a, b) => b.auraPoints - a.auraPoints);
    return { hunters, loading: false, error: null, refetch: () => {}, sample: true };
  }, [user]);

  const model: ShellModel = {
    demo: true,
    activityScope: 'demo',
    role,
    user,
    email: null,
    quests,
    drops: INITIAL_WORKOUT_DROPS,
    dropsLoading: false,
    dropsError: null,
    leaderboard,
    topSlot: (
      <>
        <DemoBanner onSignIn={auth.backendAvailable ? auth.exitDemo : undefined} />
        {/* The role switcher is a demo-only affordance; real roles come from the server profile. */}
        <RoleSwitcher value={role} onChange={setRole} />
      </>
    ),
    completeQuest: async (questId) => {
      const quest = quests.find((q) => q.id === questId);
      if (!quest || !hasPermission(role, 'DO_QUESTS')) return null;
      if (quest.completed) {
        alertAlreadyClaimed();
        return null;
      }
      const auraEarned = calculateAuraGain(quest.auraReward, user.streakDays);
      completeQuest(questId);
      return { auraEarned, stat: quest.statReward.stat, amount: quest.statReward.amount };
    },
    claimWorkout: async (drop) => {
      if (!hasPermission(role, 'START_WORKOUT')) return null;
      const auraEarned = calculateAuraGain(drop.xpPoints, user.streakDays, drop.auraMultiplier);
      finishWorkout(drop);
      return { auraEarned };
    },
    saveProfile: async (patch) => {
      updateProfile(patch);
      return {};
    },
    resetLocalData: resetGame,
    themePreference: state.themePreference,
    setTheme,
    toggleTheme: onToggleTheme,
  };

  // One-time, skippable intro the first time demo mode is opened on this device.
  if (!intro.loaded) return null;
  if (!intro.seen) return <DemoIntroScreen onDone={intro.markSeen} />;

  return <MainShell model={model} />;
}

const ROLES: readonly UserRole[] = ['MEMBER', 'CREATOR', 'ADMIN'];

/** Signed-in experience backed by the AuraFit API. */
function ServerShell({ store, onToggleTheme }: { store: GameStore; onToggleTheme: () => void }) {
  const { colors } = useTheme();
  const auth = useAuth();
  const me = useMe();
  const profile = me.data?.profile ?? null;
  // Unknown roles from the server degrade to the least-privileged view.
  const role: UserRole = profile && ROLES.includes(profile.role) ? profile.role : 'MEMBER';

  const drops = useDrops(!!profile);
  const leaderboard = useLeaderboard(!!profile);
  const completeQuest = useCompleteQuest(me);
  const completeWorkout = useCompleteWorkout(me);
  const signOut = useCallback(() => void auth.signOut(), [auth]);
  // Set by onboarding's "Start now": MainShell opens that workout once drops are loaded.
  const [startDropId, setStartDropId] = useState<string | null>(null);

  if (!me.data) {
    return (
      <View style={styles.center}>
        {me.loading ? (
          <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Loading your profile" />
        ) : (
          <View style={styles.errorBox}>
            <FormMessage tone="error" message={me.error ?? "Couldn't load your profile."} />
            <AppButton label="Try again" onPress={() => void me.refetch()} testID="profile-retry" />
            <AppButton label="Sign out" variant="ghost" onPress={signOut} testID="profile-signout" />
          </View>
        )}
      </View>
    );
  }

  const user = me.data.profile;
  if (needsOnboarding(user)) {
    return (
      <OnboardingScreen
        initialUsername={user.username}
        drops={drops.data ?? []}
        onSignOut={signOut}
        onComplete={({ profile: updated, startDropId: id }) => {
          setStartDropId(id);
          me.setData((d) => (d ? { ...d, profile: updated } : d));
        }}
      />
    );
  }
  const syncError = me.error ?? drops.error;
  const model: ShellModel = {
    demo: false,
    activityScope: user.id,
    role,
    user,
    email: auth.session?.user.email ?? null,
    quests: me.data.quests,
    drops: drops.data ?? [],
    dropsLoading: drops.loading,
    dropsError: drops.error,
    leaderboard: {
      hunters: leaderboard.data?.hunters ?? [],
      loading: leaderboard.loading,
      refreshing: leaderboard.refreshing,
      error: leaderboard.error,
      refetch: () => void leaderboard.refetch(),
      sample: false,
    },
    homeHeader: syncError ? <FormMessage tone="error" message={syncError} /> : null,
    refresh: {
      refreshing: me.refreshing,
      onRefresh: () => {
        void me.refetch();
        void drops.refetch();
      },
    },
    completeQuest: async (questId) => {
      const res = await completeQuest(questId);
      return res ? { auraEarned: res.auraEarned, stat: res.statGain.stat, amount: res.statGain.amount } : null;
    },
    claimWorkout: async (drop) => {
      const res = await completeWorkout(drop);
      return res ? { auraEarned: res.auraEarned } : null;
    },
    saveProfile: async (patch) => {
      const res = await updateOwnProfile(user.id, patch);
      if (!res.error) await me.refetch();
      return res;
    },
    resetLocalData: store.resetGame,
    themePreference: store.state.themePreference,
    setTheme: store.setTheme,
    toggleTheme: onToggleTheme,
    initialWorkoutId: startDropId,
  };

  return <MainShell model={model} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  errorBox: {
    alignSelf: 'stretch',
    gap: spacing.md,
  },
});
