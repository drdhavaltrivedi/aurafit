import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { hasPermission, type WorkoutDrop } from '@aurafit/shared';
import { AppHeader } from './src/components/AppHeader';
import { RoleSwitcher } from './src/components/RoleSwitcher';
import { WorkoutSessionModal } from './src/components/WorkoutSessionModal';
import { useGameStore, type GameStore } from './src/hooks/useGameStore';
import { AdminScreen } from './src/screens/AdminScreen';
import { CreatorScreen } from './src/screens/CreatorScreen';
import { MemberScreen } from './src/screens/MemberScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';

// Keep the native splash up until persisted state is loaded, so users never see default data
// flash before their saved progress.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden (e.g. fast refresh) */
});

export default function App() {
  const store = useGameStore();

  useEffect(() => {
    if (store.hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [store.hydrated]);

  return (
    <SafeAreaProvider>
      <ThemeProvider preference={store.state.themePreference}>
        {store.hydrated ? <Shell store={store} /> : null}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Shell({ store }: { store: GameStore }) {
  const { colors, isDark } = useTheme();
  const { state, setRole, setTheme, completeQuest, finishWorkout } = store;
  const { role, user, quests } = state;
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDrop | null>(null);

  // Root view colour shows behind the keyboard, modals and during rotation.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bgPage).catch(() => {});
  }, [colors.bgPage]);

  const toggleTheme = useCallback(() => setTheme(isDark ? 'light' : 'dark'), [isDark, setTheme]);

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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPage }]} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppHeader auraPoints={user.auraPoints} streakDays={user.streakDays} onToggleTheme={toggleTheme} />
      <RoleSwitcher value={role} onChange={setRole} />

      <View style={styles.body}>
        {role === 'MEMBER' && (
          <MemberScreen
            role={role}
            user={user}
            quests={quests}
            onCompleteQuest={completeQuest}
            onStartWorkout={startWorkout}
          />
        )}
        {role === 'CREATOR' && <CreatorScreen role={role} />}
        {role === 'ADMIN' && <AdminScreen role={role} />}
      </View>

      <WorkoutSessionModal drop={activeWorkout} onClose={closeWorkout} onClaim={claimWorkout} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
});
