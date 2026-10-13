import React, { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { Exercise, WorkoutDrop } from '@aurafit/shared';
import { useCountdown } from '../hooks/useCountdown';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, radius, spacing } from '../theme/tokens';
import { AppButton } from './AppButton';
import { HealthDisclaimer } from './Legal';

const SET_SECONDS = 45;

interface WorkoutSessionModalProps {
  drop: WorkoutDrop | null;
  onClose: () => void;
  onClaim: (drop: WorkoutDrop) => void;
}

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

export function WorkoutSessionModal({ drop, onClose, onClaim }: WorkoutSessionModalProps) {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const claimedRef = useRef(false);

  const onSetDone = useCallback(() => {
    AccessibilityInfo.announceForAccessibility('Set complete. Take a breath.');
  }, []);
  const timer = useCountdown(SET_SECONDS, onSetDone);
  const { reset } = timer;

  // Fresh timer and claim guard for every workout opened.
  useEffect(() => {
    claimedRef.current = false;
    reset();
  }, [drop?.id, reset]);

  const handleClaim = () => {
    if (!drop || claimedRef.current) return; // guard against double-tap double award
    claimedRef.current = true;
    onClaim(drop);
  };

  const running = timer.status === 'running';
  const timerAction = running ? timer.pause : timer.start;
  const timerLabel = running ? 'Pause' : timer.status === 'paused' ? 'Resume' : timer.status === 'done' ? 'Next set' : 'Start set';

  const renderExercise = ({ item, index }: { item: Exercise; index: number }) => (
    <View
      accessible
      accessibilityLabel={`Move ${index + 1}: ${item.name}. ${item.repsOrSeconds}. Targets ${item.targetMuscle}.`}
      style={[styles.exRow, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}
    >
      <Text style={[styles.exIndex, { color: colors.primary }]}>#{index + 1}</Text>
      <View style={styles.exText}>
        <Text style={[styles.exName, { color: colors.textPrimary }]}>{item.name}</Text>
        <Text style={[styles.exReps, { color: colors.textSecondary }]}>
          {item.repsOrSeconds} • {item.targetMuscle}
        </Text>
      </View>
    </View>
  );

  return (
    <Modal
      visible={drop !== null}
      animationType={reducedMotion ? 'none' : 'slide'}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* Modals render in a separate native window; they need their own provider for correct insets. */}
      <SafeAreaProvider>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPage }]} edges={['top', 'bottom', 'left', 'right']}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          {drop ? (
            <>
              <View style={styles.header}>
                <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
                  {drop.title}
                </Text>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close workout"
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.closeBtn,
                    { backgroundColor: colors.bgElevated, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.closeText, { color: colors.textSecondary }]}>✕</Text>
                </Pressable>
              </View>

              <View
                style={styles.timerWrap}
                accessible
                accessibilityLabel={`Set timer: ${timer.remaining} seconds remaining${running ? '' : ', stopped'}`}
              >
                <Text
                  style={[styles.timerDigits, { color: timer.status === 'done' ? colors.emerald : colors.primary }]}
                  maxFontSizeMultiplier={1.2}
                >
                  {formatSeconds(timer.remaining)}
                </Text>
                <Text style={[styles.timerSub, { color: colors.textSecondary }]}>
                  {timer.status === 'done' ? 'Set complete — rest up' : 'Focus on clean form'}
                </Text>
              </View>
              <View style={styles.timerControls}>
                <AppButton label={timerLabel} accessibilityLabel={`${timerLabel} timer`} onPress={timerAction} />
                <AppButton
                  label="Reset"
                  accessibilityLabel="Reset timer"
                  variant="secondary"
                  onPress={timer.reset}
                  disabled={timer.status === 'idle'}
                />
              </View>

              <FlatList
                data={drop.exercises}
                keyExtractor={(ex) => ex.id}
                renderItem={renderExercise}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              />

              <View style={styles.disclaimer}>
                <HealthDisclaimer />
              </View>

              <AppButton
                label="⚔️ Claim Workout Aura"
                accessibilityLabel="Finish workout and claim aura"
                variant="success"
                size="lg"
                onPress={handleClaim}
                style={styles.claimBtn}
              />
            </>
          ) : null}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg + 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  closeBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 18,
    fontWeight: '700',
  },
  timerWrap: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  timerDigits: {
    fontSize: fontSize.display,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  timerSub: {
    fontSize: fontSize.body - 1,
  },
  timerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.sm + 2,
    paddingBottom: spacing.lg,
  },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    gap: spacing.sm + 2,
  },
  exIndex: {
    fontWeight: '900',
    fontSize: fontSize.body - 1,
  },
  exText: {
    flex: 1,
  },
  exName: {
    fontWeight: '800',
    fontSize: fontSize.body - 1,
  },
  exReps: {
    fontSize: fontSize.caption,
  },
  disclaimer: {
    paddingVertical: spacing.sm,
  },
  claimBtn: {
    marginBottom: spacing.lg,
  },
});
