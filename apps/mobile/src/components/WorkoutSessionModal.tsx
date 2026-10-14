import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Check, ChevronRight, Music, Pause, Play, Swords, X, Zap } from './icons';
import type { Exercise, WorkoutDrop } from '@aurafit/shared';
import { useCountdown } from '../hooks/useCountdown';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, radius, spacing } from '../theme/tokens';
import { AppButton } from './AppButton';
import { AppIcon } from './AppIcon';
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

/** Matches exercise keywords to our high-resolution anime training demonstration artwork */
function getExerciseVisual(exercise?: Exercise) {
  if (!exercise) return require('../../assets/hunter-avatar.jpg');
  const text = `${exercise.name} ${exercise.targetMuscle}`.toLowerCase();
  if (
    text.includes('push') ||
    text.includes('dip') ||
    text.includes('chest') ||
    text.includes('tricep') ||
    text.includes('shoulder')
  ) {
    return require('../../assets/workouts/pushup.jpg');
  }
  if (
    text.includes('squat') ||
    text.includes('lunge') ||
    text.includes('leg') ||
    text.includes('quad') ||
    text.includes('glute') ||
    text.includes('calf')
  ) {
    return require('../../assets/workouts/squat.jpg');
  }
  if (
    text.includes('plank') ||
    text.includes('core') ||
    text.includes('ab') ||
    text.includes('dead bug') ||
    text.includes('bird dog') ||
    text.includes('hollow')
  ) {
    return require('../../assets/workouts/plank.jpg');
  }
  return require('../../assets/hunter-avatar.jpg');
}

export function WorkoutSessionModal({ drop, onClose, onClaim }: WorkoutSessionModalProps) {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const claimedRef = useRef(false);

  const [activeMoveIndex, setActiveMoveIndex] = useState(0);
  const [isPhonkPlaying, setIsPhonkPlaying] = useState(true);
  const [waveHeights, setWaveHeights] = useState([8, 16, 12, 22, 18, 14, 20, 10]);

  const onSetDone = useCallback(() => {
    AccessibilityInfo.announceForAccessibility('Set complete. Take a breath.');
  }, []);
  const timer = useCountdown(SET_SECONDS, onSetDone);
  const { reset } = timer;

  // Fresh timer, move index and claim guard for every workout opened.
  useEffect(() => {
    claimedRef.current = false;
    setActiveMoveIndex(0);
    reset();
  }, [drop?.id, reset]);

  // Animated audio waveform rhythm effect while timer and phonk are active
  useEffect(() => {
    if (!isPhonkPlaying || timer.status !== 'running') return;
    const interval = setInterval(() => {
      setWaveHeights((prev) => prev.map(() => Math.floor(Math.random() * 18) + 6));
    }, 180);
    return () => clearInterval(interval);
  }, [isPhonkPlaying, timer.status]);

  const handleClaim = () => {
    if (!drop || claimedRef.current) return; // guard against double-tap double award
    claimedRef.current = true;
    onClaim(drop);
  };

  const running = timer.status === 'running';
  const timerAction = running ? timer.pause : timer.start;
  const timerLabel = running
    ? 'Pause'
    : timer.status === 'paused'
    ? 'Resume'
    : timer.status === 'done'
    ? 'Next set'
    : 'Start set';

  const totalMoves = drop?.exercises.length || 1;
  const currentExercise = drop?.exercises[Math.min(activeMoveIndex, totalMoves - 1)] || drop?.exercises[0];

  const handleNextMove = () => {
    if (activeMoveIndex < totalMoves - 1) {
      setActiveMoveIndex((i) => i + 1);
      timer.reset();
    }
  };

  const handlePrevMove = () => {
    if (activeMoveIndex > 0) {
      setActiveMoveIndex((i) => i - 1);
      timer.reset();
    }
  };

  const renderExercise = ({ item, index }: { item: Exercise; index: number }) => {
    const isSelected = index === activeMoveIndex;
    return (
      <Pressable
        onPress={() => {
          setActiveMoveIndex(index);
          timer.reset();
        }}
        accessible
        accessibilityLabel={`Move ${index + 1}: ${item.name}. ${item.repsOrSeconds}. Targets ${item.targetMuscle}.`}
        style={({ pressed }) => [
          styles.exRow,
          {
            backgroundColor: isSelected ? 'rgba(124, 58, 237, 0.16)' : colors.bgElevated,
            borderColor: isSelected ? colors.primary : colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <View style={[styles.exIndexBadge, { backgroundColor: isSelected ? colors.primary : colors.bgSurface }]}>
          <Text style={[styles.exIndex, { color: isSelected ? '#FFFFFF' : colors.primary }]}>#{index + 1}</Text>
        </View>
        <View style={styles.exText}>
          <Text style={[styles.exName, { color: colors.textPrimary }]}>{item.name}</Text>
          <Text style={[styles.exReps, { color: colors.textSecondary }]}>
            {item.repsOrSeconds} • {item.targetMuscle}
          </Text>
        </View>
        {isSelected ? (
          <View style={styles.selectedDot}>
            <AppIcon icon={Check} size={14} color={colors.primary} strokeWidth={3} />
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <Modal
      visible={drop !== null}
      animationType={reducedMotion ? 'none' : 'slide'}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <SafeAreaProvider>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPage }]} edges={['top', 'bottom', 'left', 'right']}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          {drop ? (
            <>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerTextCol}>
                  <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
                    {drop.title}
                  </Text>
                  <Text style={[styles.subTitle, { color: colors.primary }]}>
                    {drop.vibeTag} • {drop.auraMultiplier}x AURA MULTIPLIER
                  </Text>
                </View>
                <Pressable
                  onPress={onClose}
                  testID="workout-close"
                  accessibilityRole="button"
                  accessibilityLabel="Close workout"
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.closeBtn,
                    { backgroundColor: colors.bgElevated, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <AppIcon icon={X} size={20} color={colors.textSecondary} strokeWidth={2.5} />
                </Pressable>
              </View>

              {/* Visual Exercise Demonstration Banner */}
              {currentExercise ? (
                <View style={[styles.visualHeroCard, { borderColor: colors.border }]}>
                  <ImageBackground
                    source={getExerciseVisual(currentExercise)}
                    style={styles.visualHeroBg}
                    imageStyle={styles.visualHeroImg}
                  >
                    <View style={styles.visualScrim} />
                    <View style={styles.visualContent}>
                      <View style={styles.visualTopRow}>
                        <View style={styles.moveStepBadge}>
                          <AppIcon icon={Zap} size={12} color="#C4B5FD" />
                          <Text style={styles.moveStepText}>
                            MOVE {activeMoveIndex + 1} OF {totalMoves}
                          </Text>
                        </View>
                        <View style={styles.muscleBadge}>
                          <Text style={styles.muscleBadgeText}>{currentExercise.targetMuscle.toUpperCase()}</Text>
                        </View>
                      </View>

                      <Text style={styles.activeMoveName}>{currentExercise.name}</Text>
                      <Text style={styles.activeMoveReps}>{currentExercise.repsOrSeconds}</Text>

                      {currentExercise.tips ? (
                        <View style={styles.tipBox}>
                          <Text style={styles.tipText} numberOfLines={2}>
                            💡 {currentExercise.tips}
                          </Text>
                        </View>
                      ) : null}

                      {/* Move Switcher Controls */}
                      <View style={styles.navRow}>
                        <Pressable
                          onPress={handlePrevMove}
                          disabled={activeMoveIndex === 0}
                          style={[styles.navBtn, { opacity: activeMoveIndex === 0 ? 0.4 : 1 }]}
                        >
                          <AppIcon icon={ArrowLeft} size={16} color="#FFFFFF" strokeWidth={2.5} />
                          <Text style={styles.navBtnText}>Prev Move</Text>
                        </Pressable>

                        <Pressable
                          onPress={handleNextMove}
                          disabled={activeMoveIndex >= totalMoves - 1}
                          style={[styles.navBtn, { opacity: activeMoveIndex >= totalMoves - 1 ? 0.4 : 1 }]}
                        >
                          <Text style={styles.navBtnText}>Next Move</Text>
                          <AppIcon icon={ChevronRight} size={16} color="#FFFFFF" strokeWidth={2.5} />
                        </Pressable>
                      </View>
                    </View>
                  </ImageBackground>
                </View>
              ) : null}

              {/* In-Workout Phonk Audio & Waveform Bar */}
              <View style={[styles.audioBar, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
                <View style={[styles.musicIconCircle, { backgroundColor: colors.primarySubtle }]}>
                  <AppIcon icon={Music} size={16} color={colors.primary} />
                </View>
                <View style={styles.audioTextCol}>
                  <Text style={[styles.audioTrackName, { color: colors.textPrimary }]}>
                    Shadow Surge (140 BPM Phonk Mix)
                  </Text>
                  <Text style={[styles.audioStatus, { color: isPhonkPlaying ? colors.cyan : colors.textMuted }]}>
                    {isPhonkPlaying ? '🔥 BEAT SYNC ACTIVE' : 'AUDIO PAUSED'}
                  </Text>
                </View>
                {/* Waveform visualizer */}
                <View style={styles.waveWrap}>
                  {waveHeights.map((h, i) => (
                    <View
                      key={i}
                      style={[
                        styles.waveBar,
                        {
                          height: isPhonkPlaying && running ? h : 6,
                          backgroundColor: isPhonkPlaying && running ? colors.primary : colors.textMuted,
                        },
                      ]}
                    />
                  ))}
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() => setIsPhonkPlaying(!isPhonkPlaying)}
                  style={[styles.playToggleBtn, { backgroundColor: colors.primary }]}
                >
                  <AppIcon icon={isPhonkPlaying ? Pause : Play} size={14} color="#FFFFFF" />
                </Pressable>
              </View>

              {/* Timer Section */}
              <View
                style={styles.timerWrap}
                testID="workout-timer"
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
                  {timer.status === 'done' ? 'Set complete — breathe and advance!' : 'Hold clean form through every rep'}
                </Text>
              </View>

              <View style={styles.timerControls}>
                <AppButton testID="workout-timer-toggle" label={timerLabel} accessibilityLabel={`${timerLabel} timer`} onPress={timerAction} />
                <AppButton
                  testID="workout-timer-reset"
                  label="Reset"
                  accessibilityLabel="Reset timer"
                  variant="secondary"
                  onPress={timer.reset}
                  disabled={timer.status === 'idle'}
                />
              </View>

              {/* Movement Checklist */}
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
                testID="workout-claim"
                label="Claim Workout Aura"
                icon={Swords}
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
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  headerTextCol: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  subTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  closeBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualHeroCard: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1.5,
    backgroundColor: '#0A0F1D',
    marginBottom: spacing.xs,
  },
  visualHeroBg: {
    width: '100%',
    padding: spacing.md,
  },
  visualHeroImg: {
    opacity: 0.45,
    resizeMode: 'cover',
  },
  visualScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 10, 20, 0.72)',
  },
  visualContent: {
    position: 'relative',
    gap: 4,
  },
  visualTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  moveStepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(124, 58, 237, 0.40)',
    borderColor: '#8B5CF6',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  moveStepText: {
    color: '#DDD6FE',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  muscleBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  muscleBadgeText: {
    color: '#E2E8F0',
    fontSize: 9,
    fontWeight: '800',
  },
  activeMoveName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  activeMoveReps: {
    color: '#C4B5FD',
    fontSize: 11,
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  tipBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderLeftWidth: 2.5,
    borderLeftColor: '#8B5CF6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 2,
  },
  tipText: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '600',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  navBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  audioBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    marginVertical: 4,
  },
  musicIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioTextCol: {
    flex: 1,
  },
  audioTrackName: {
    fontSize: 11,
    fontWeight: '800',
  },
  audioStatus: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  waveWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 24,
    paddingHorizontal: 4,
  },
  waveBar: {
    width: 2.5,
    borderRadius: 1.5,
  },
  playToggleBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerWrap: {
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  timerDigits: {
    fontSize: fontSize.display - 10,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  timerSub: {
    fontSize: fontSize.caption,
    fontWeight: '600',
  },
  timerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.xs + 2,
    paddingBottom: spacing.sm,
  },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    gap: spacing.sm + 2,
  },
  exIndexBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exIndex: {
    fontWeight: '900',
    fontSize: 11,
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
  selectedDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disclaimer: {
    paddingVertical: spacing.xs,
  },
  claimBtn: {
    marginBottom: spacing.sm,
  },
});
