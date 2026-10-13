import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { hasPermission, type UserRole, type WorkoutDrop } from '@aurafit/shared';
import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { AppButton } from './src/components/AppButton';
import { AppHeader } from './src/components/AppHeader';
import { FormMessage } from './src/components/AuthLayout';
import { DemoBanner } from './src/components/DemoBanner';
import { RoleSwitcher } from './src/components/RoleSwitcher';
import { WorkoutSessionModal } from './src/components/WorkoutSessionModal';
import { useCompleteQuest, useCompleteWorkout, useDrops, useLeaderboard, useMe } from './src/hooks/useApi';
import { useGameStore, type GameStore } from './src/hooks/useGameStore';
import { AdminScreen } from './src/screens/AdminScreen';
import { CreatorScreen } from './src/screens/CreatorScreen';
import { MemberScreen } from './src/screens/MemberScreen';
import { AuthNavigator } from './src/screens/auth/AuthNavigator';
import { ResetPasswordScreen } from './src/screens/auth/ResetPasswordScreen';
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
  else if (auth.status === 'signedIn') content = <ServerShell onToggleTheme={toggleTheme} />;
  else if (auth.status === 'demo') content = <DemoShell store={store} onToggleTheme={toggleTheme} />;
  else content = <AuthNavigator />;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPage }]} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {content}
    </SafeAreaView>
  );
}

/** Original local-only experience (seed data + AsyncStorage reducer). */
function DemoShell({ store, onToggleTheme }: { store: GameStore; onToggleTheme: () => void }) {
  const auth = useAuth();
  const { state, setRole, completeQuest, finishWorkout } = store;
  const { role, user, quests } = state;
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDrop | null>(null);

  const startWorkout = useCallback(
    (drop: WorkoutDrop) => {
      if (hasPermission(role, 'START_WORKOUT')) setActiveWorkout(drop);
    },
    [role]
  );
  const closeWorkout = useCallback(() => setActiveWorkout(null), []);
  const claimWorkout = useCallback(
    (drop: WorkoutDrop) => {
      finishWorkout(drop);
      setActiveWorkout(null);
    },
    [finishWorkout]
  );

  return (
    <>
      <AppHeader auraPoints={user.auraPoints} streakDays={user.streakDays} onToggleTheme={onToggleTheme} />
      <DemoBanner onSignIn={auth.backendAvailable ? auth.exitDemo : undefined} />
      {/* The role switcher is a demo-only affordance; real roles come from the server profile. */}
      <RoleSwitcher value={role} onChange={setRole} />

      <View style={styles.body}>
        {role === 'MEMBER' && (
          <MemberScreen role={role} user={user} quests={quests} onCompleteQuest={completeQuest} onStartWorkout={startWorkout} />
        )}
        {role === 'CREATOR' && <CreatorScreen role={role} />}
        {role === 'ADMIN' && <AdminScreen role={role} />}
      </View>

      <WorkoutSessionModal drop={activeWorkout} onClose={closeWorkout} onClaim={claimWorkout} />
    </>
  );
}

const ROLES: readonly UserRole[] = ['MEMBER', 'CREATOR', 'ADMIN'];

/** Signed-in experience backed by the AuraFit API. */
function ServerShell({ onToggleTheme }: { onToggleTheme: () => void }) {
  const { colors } = useTheme();
  const auth = useAuth();
  const me = useMe();
  const profile = me.data?.profile ?? null;
  // Unknown roles from the server degrade to the least-privileged view.
  const role: UserRole = profile && ROLES.includes(profile.role) ? profile.role : 'MEMBER';

  const drops = useDrops(!!profile);
  const leaderboard = useLeaderboard(!!profile && role === 'ADMIN');
  const completeQuest = useCompleteQuest(me);
  const completeWorkout = useCompleteWorkout(me);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDrop | null>(null);

  const startWorkout = useCallback(
    (drop: WorkoutDrop) => {
      if (hasPermission(role, 'START_WORKOUT')) setActiveWorkout(drop);
    },
    [role]
  );
  const closeWorkout = useCallback(() => setActiveWorkout(null), []);
  const claimWorkout = useCallback(
    (drop: WorkoutDrop) => {
      setActiveWorkout(null);
      void completeWorkout(drop);
    },
    [completeWorkout]
  );
  const onQuest = useCallback((id: string) => void completeQuest(id), [completeQuest]);

  const signOut = useCallback(() => void auth.signOut(), [auth]);
  const accountLabel = auth.session?.user.email ?? 'Account';

  if (!me.data) {
    return (
      <>
        <AppHeader auraPoints={0} streakDays={0} onToggleTheme={onToggleTheme} accountLabel={accountLabel} onSignOut={signOut} />
        <View style={styles.center}>
          {me.loading ? (
            <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Loading your profile" />
          ) : (
            <View style={styles.errorBox}>
              <FormMessage tone="error" message={me.error ?? "Couldn't load your profile."} />
              <AppButton label="Try again" onPress={() => void me.refetch()} />
              <AppButton label="Sign out" variant="ghost" onPress={signOut} />
            </View>
          )}
        </View>
      </>
    );
  }

  const { quests } = me.data;
  const user = me.data.profile;
  const refresh = (
    <RefreshControl
      refreshing={me.refreshing}
      onRefresh={() => {
        void me.refetch();
        void drops.refetch();
      }}
      tintColor={colors.primary}
      colors={[colors.primaryStrong]}
    />
  );

  return (
    <>
      <AppHeader
        auraPoints={user.auraPoints}
        streakDays={user.streakDays}
        onToggleTheme={onToggleTheme}
        accountLabel={accountLabel}
        onSignOut={signOut}
      />
      <View style={styles.body}>
        {role === 'MEMBER' && (
          <MemberScreen
            role={role}
            user={user}
            quests={quests}
            drops={drops.data ?? []}
            onCompleteQuest={onQuest}
            onStartWorkout={startWorkout}
            refreshControl={refresh}
            header={
              me.error || drops.error ? (
                <FormMessage tone="error" message={me.error ?? drops.error ?? ''} />
              ) : drops.loading ? (
                <Text style={{ color: colors.textMuted }}>Loading workout drops…</Text>
              ) : null
            }
          />
        )}
        {role === 'CREATOR' && <CreatorScreen role={role} profile={user} drops={drops.data ?? []} />}
        {role === 'ADMIN' && <AdminScreen role={role} hunters={leaderboard.data?.hunters} />}
      </View>
      <WorkoutSessionModal drop={activeWorkout} onClose={closeWorkout} onClaim={claimWorkout} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
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
