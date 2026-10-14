import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {
  FITNESS_GOAL_META,
  FITNESS_GOALS,
  FITNESS_LEVEL_META,
  FITNESS_LEVELS,
  formatOnboardingHour,
  normalizeUsername,
  ONBOARDING_DEFAULT_REMINDER_HOUR,
  ONBOARDING_PROGRESS_STEPS,
  ONBOARDING_REMINDER_HOURS,
  ONBOARDING_STEPS,
  recommendFirstWorkout,
  type FitnessGoal,
  type FitnessLevel,
  type OnboardingStep,
  type UserProfile,
  type WorkoutDrop,
} from '@aurafit/shared';
import { api } from '../../api';
import { errorMessage } from '../../hooks/useApi';
import { useReminder } from '../../hooks/useReminder';
import { nextStep, previousStep, syncNotificationSettings, updateMe, type ReminderSyncOutcome } from '../../lib/onboarding';
import { AppButton } from '../../components/AppButton';
import { AppIcon } from '../../components/AppIcon';
import { FormMessage } from '../../components/AuthLayout';
import { TextField } from '../../components/TextField';
import {
  ArrowLeft,
  ArrowRight,
  BellOff,
  CalendarCheck,
  Clock,
  Dumbbell,
  Flame,
  HeartPulse,
  PersonStanding,
  Play,
  ShieldCheck,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Swords,
  Timer,
  type LucideIcon,
} from '../../components/icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../../theme/tokens';
import { ChoiceCard, StepHeader, StepProgress } from './OnboardingParts';

const GOAL_ICONS: Record<FitnessGoal, LucideIcon> = {
  BUILD_STRENGTH: Dumbbell,
  LOSE_WEIGHT: Flame,
  GET_FIT: HeartPulse,
  BUILD_HABIT: CalendarCheck,
  MOBILITY: PersonStanding,
};
const LEVEL_ICONS: Record<FitnessLevel, LucideIcon> = {
  BEGINNER: SignalLow,
  INTERMEDIATE: SignalMedium,
  ADVANCED: SignalHigh,
};
const STEP_LABELS: Record<Exclude<OnboardingStep, 'done'>, string> = {
  welcome: 'Name',
  goal: 'Goal',
  level: 'Level',
  reminder: 'Reminder',
};

export interface OnboardingResult {
  profile: UserProfile;
  /** Drop to open right away ("Start now"), or null ("Go to Arena"). */
  startDropId: string | null;
}

interface Props {
  initialUsername: string;
  drops: WorkoutDrop[];
  onComplete: (result: OnboardingResult) => void;
  onSignOut: () => void;
}

/** Signed-in (server mode) onboarding: name, goal, level, reminder, then a recommended first workout. */
export function OnboardingScreen({ initialUsername, drops, onComplete, onSignOut }: Props) {
  const { colors, isDark } = useTheme();
  // Existing local daily reminder; permission is requested only when the user picks a time.
  const reminder = useReminder();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [username, setUsername] = useState(initialUsername);
  const [goal, setGoal] = useState<FitnessGoal | null>(null);
  const [level, setLevel] = useState<FitnessLevel | null>(null);
  const [hour, setHour] = useState<number | null>(ONBOARDING_DEFAULT_REMINDER_HOUR);
  const [streakSaver, setStreakSaver] = useState(true);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  const index = ONBOARDING_STEPS.indexOf(step);
  const progressStep = Math.min(index + 1, ONBOARDING_PROGRESS_STEPS);
  const recommended = useMemo(() => {
    const id = recommendFirstWorkout(goal, level, drops);
    return drops.find((d) => d.id === id) ?? null;
  }, [goal, level, drops]);

  const go = useCallback((next: OnboardingStep) => {
    setFieldError(null);
    setSubmitError(null);
    setStep(next);
  }, []);
  const back = useCallback(() => {
    const prev = previousStep(step);
    if (prev && !busy) go(prev);
  }, [step, busy, go]);

  // New step: scroll to top and announce it for screen readers.
  const first = useRef(true);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    if (first.current) {
      first.current = false;
      return;
    }
    AccessibilityInfo.announceForAccessibility(
      step === 'done' ? 'Setup complete.' : `Step ${progressStep} of ${ONBOARDING_PROGRESS_STEPS}: ${STEP_LABELS[step]}`
    );
  }, [step, progressStep]);

  // Android back: previous step. On the first step the OS handles it; never leaves the finish screen.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'done' || busy) return true;
      const prev = previousStep(step);
      if (!prev) return false;
      go(prev);
      return true;
    });
    return () => sub.remove();
  }, [step, busy, go]);

  const continueFrom = () => {
    if (step === 'welcome') {
      const n = normalizeUsername(username);
      if (!n.ok) return setFieldError(n.error);
      setUsername(n.value);
    }
    if (step === 'goal' && !goal) return setFieldError('Pick the goal that fits you best.');
    if (step === 'level' && !level) return setFieldError('Pick your current level.');
    go(nextStep(step));
  };

  const finish = async (chosenHour: number | null) => {
    if (busy || !goal || !level || !api) return;
    setBusy(true);
    setSubmitError(null);
    const name = normalizeUsername(username);
    let updated: UserProfile;
    try {
      const res = await updateMe(api, {
        fitnessGoal: goal,
        fitnessLevel: level,
        ...(name.ok && name.value !== initialUsername ? { username: name.value } : {}),
        completeOnboarding: true,
      });
      updated = res.profile;
    } catch (err) {
      setBusy(false);
      setSubmitError(errorMessage(err));
      return;
    }

    const notes: string[] = [];
    // Server-side settings (streak saver push). Never blocks onboarding.
    const synced: ReminderSyncOutcome = await syncNotificationSettings(api, { reminderHour: chosenHour, streakSaver });
    if (synced === 'failed') notes.push("We couldn't save your reminder settings. You can change them later in Settings.");
    // Local daily reminder: works without push. Permission is requested only when opted in.
    if (chosenHour !== null) {
      const ok = await reminder.enableAt(chosenHour, 0).catch(() => false);
      notes.push(
        ok
          ? `Daily reminder set for ${formatOnboardingHour(chosenHour)}.`
          : 'Notifications are off for AuraFit, so we could not set your reminder. You can turn it on later in Settings.'
      );
    }
    setNotices(notes);
    setProfile(updated);
    setBusy(false);
    go('done');
  };

  const done = (startDropId: string | null) => {
    if (profile) onComplete({ profile, startDropId });
  };

  let body: React.ReactNode;
  if (step === 'welcome') {
    body = (
      <>
        <StepHeader
          eyebrow="Welcome, hunter"
          title="Let's set up your arena"
          subtitle="Four quick questions so your first quest fits you. It takes under a minute."
        />
        <TextField
          testID="onboarding-name"
          label="Display name"
          value={username}
          onChangeText={(t) => {
            setUsername(t);
            setFieldError(null);
          }}
          maxLength={50}
          autoCapitalize="words"
          autoComplete="nickname"
          returnKeyType="next"
          onSubmitEditing={continueFrom}
          error={fieldError ?? undefined}
          hint="Shown on leaderboards and your hunter card."
        />
      </>
    );
  } else if (step === 'goal') {
    body = (
      <>
        <StepHeader eyebrow="Your goal" title="What brings you to AuraFit?" subtitle="We use this to pick your first workout." />
        <View accessibilityRole="radiogroup" accessibilityLabel="Fitness goal" style={styles.choices}>
          {FITNESS_GOALS.map((g) => (
            <ChoiceCard
              key={g}
              testID={`goal-${g}`}
              icon={GOAL_ICONS[g]}
              label={FITNESS_GOAL_META[g].label}
              description={FITNESS_GOAL_META[g].description}
              selected={goal === g}
              onPress={() => {
                setGoal(g);
                setFieldError(null);
              }}
            />
          ))}
        </View>
        {fieldError ? <FormMessage tone="error" message={fieldError} /> : null}
      </>
    );
  } else if (step === 'level') {
    body = (
      <>
        <StepHeader
          eyebrow="Your level"
          title="How much do you train right now?"
          subtitle="Be honest: we will never start you on something brutal."
        />
        <View accessibilityRole="radiogroup" accessibilityLabel="Fitness level" style={styles.choices}>
          {FITNESS_LEVELS.map((l) => (
            <ChoiceCard
              key={l}
              testID={`level-${l}`}
              icon={LEVEL_ICONS[l]}
              label={FITNESS_LEVEL_META[l].label}
              description={FITNESS_LEVEL_META[l].description}
              selected={level === l}
              onPress={() => {
                setLevel(l);
                setFieldError(null);
              }}
            />
          ))}
        </View>
        {fieldError ? <FormMessage tone="error" message={fieldError} /> : null}
      </>
    );
  } else if (step === 'reminder') {
    body = (
      <>
        <StepHeader
          eyebrow="Optional"
          title="When should we nudge you?"
          subtitle="Pick a daily reminder time (your local time), or skip it. We only ask for notification permission if you pick a time."
        />
        <View accessibilityRole="radiogroup" accessibilityLabel="Daily reminder time" style={styles.grid}>
          {ONBOARDING_REMINDER_HOURS.map((h) => (
            <View key={h} style={styles.gridItem}>
              <ChoiceCard
                compact
                testID={`reminder-hour-${h}`}
                icon={Clock}
                label={formatOnboardingHour(h)}
                selected={hour === h}
                onPress={() => setHour(h)}
              />
            </View>
          ))}
          <View style={styles.gridFull}>
            <ChoiceCard
              compact
              testID="reminder-hour-none"
              icon={BellOff}
              label="No daily reminder"
              selected={hour === null}
              onPress={() => setHour(null)}
            />
          </View>
        </View>
        <View style={[styles.saver, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
          <View style={styles.saverRow}>
            <AppIcon icon={ShieldCheck} size={20} color={colors.emerald} />
            <Text style={[styles.saverTitle, { color: colors.textPrimary }]}>Streak saver</Text>
            <Switch
              testID="onboarding-streak-saver"
              value={streakSaver}
              onValueChange={setStreakSaver}
              accessibilityLabel="Streak saver"
              trackColor={{ true: colors.primaryStrong, false: isDark ? '#334155' : '#CBD5E1' }}
              ios_backgroundColor={isDark ? '#334155' : '#CBD5E1'}
            />
          </View>
          <Text style={[styles.saverText, { color: colors.textSecondary }]}>
            If you have a streak going and haven&apos;t trained by the evening, we send one push so you don&apos;t lose it. Never more
            than once a day.
          </Text>
        </View>
        {submitError ? <FormMessage tone="error" message={submitError} /> : null}
      </>
    );
  } else {
    body = (
      <>
        <StepHeader
          eyebrow="You're in"
          title={`Ready, ${profile?.username ?? username}?`}
          subtitle="Your first quest is picked for your goal and level. Finish it to start your streak."
        />
        {notices.map((n) => (
          <FormMessage key={n} tone="info" message={n} />
        ))}
        {recommended ? (
          <View
            testID="onboarding-recommended"
            accessible
            accessibilityLabel={`Recommended first workout: ${recommended.title}, ${recommended.durationMinutes} minutes, ${recommended.difficulty}`}
            style={[styles.drop, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}
          >
            <View style={[styles.dropCover, { backgroundColor: recommended.coverGradient[0] }]}>
              <AppIcon icon={Swords} size={32} color="#FFFFFF" />
            </View>
            <View style={styles.dropBody}>
              <Text style={[styles.eyebrowSmall, { color: colors.primary }]}>RECOMMENDED FIRST WORKOUT</Text>
              <Text style={[styles.dropTitle, { color: colors.textPrimary }]}>{recommended.title}</Text>
              {recommended.tagline ? (
                <Text style={[styles.saverText, { color: colors.textSecondary }]}>{recommended.tagline}</Text>
              ) : null}
              <View style={styles.saverRow}>
                <AppIcon icon={Timer} size={16} color={colors.textSecondary} />
                <Text style={[styles.saverText, { color: colors.textSecondary }]}>
                  {recommended.durationMinutes} min · {recommended.difficulty}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <Text style={[styles.saverText, { color: colors.textSecondary }]}>
            Your arena is ready. Pick any workout to start your streak.
          </Text>
        )}
      </>
    );
  }

  let footer: React.ReactNode;
  if (step === 'done') {
    footer = (
      <>
        {recommended ? (
          <AppButton testID="onboarding-start-now" label="Start now" size="lg" icon={Play} onPress={() => done(recommended.id)} />
        ) : null}
        <AppButton
          testID="onboarding-go-arena"
          label="Go to Arena"
          size="lg"
          variant={recommended ? 'secondary' : 'primary'}
          onPress={() => done(null)}
        />
      </>
    );
  } else if (step === 'reminder') {
    footer = (
      <>
        <AppButton
          testID="onboarding-finish"
          label="Finish setup"
          size="lg"
          loading={busy}
          onPress={() => void finish(hour)}
        />
        <View style={styles.row}>
          <AppButton label="Back" variant="ghost" icon={ArrowLeft} onPress={back} disabled={busy} testID="onboarding-back" />
          <AppButton
            label="Skip for now"
            variant="ghost"
            disabled={busy}
            testID="onboarding-skip"
            onPress={() => {
              setHour(null);
              void finish(null);
            }}
          />
        </View>
      </>
    );
  } else {
    footer = (
      <>
        <AppButton testID="onboarding-next" label="Continue" size="lg" icon={ArrowRight} onPress={continueFrom} />
        {step === 'welcome' ? (
          <AppButton label="Sign out" variant="ghost" onPress={onSignOut} testID="onboarding-signout" />
        ) : (
          <AppButton label="Back" variant="ghost" icon={ArrowLeft} onPress={back} testID="onboarding-back" />
        )}
      </>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        testID="onboarding-screen"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step !== 'done' ? (
          <StepProgress step={progressStep} total={ONBOARDING_PROGRESS_STEPS} label={STEP_LABELS[step]} />
        ) : null}
        {body}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.bgPage }]}>{footer}</View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  choices: {
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
    rowGap: spacing.sm,
  },
  gridItem: {
    width: '50%',
    paddingHorizontal: spacing.xs,
  },
  gridFull: {
    width: '100%',
    paddingHorizontal: spacing.xs,
  },
  saver: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  saverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  saverTitle: {
    flex: 1,
    fontSize: fontSize.bodyLg,
    fontWeight: '800',
  },
  saverText: {
    fontSize: fontSize.body,
    lineHeight: 20,
  },
  drop: {
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  dropCover: {
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropBody: {
    padding: spacing.lg,
    gap: spacing.xs + 2,
  },
  eyebrowSmall: {
    fontSize: fontSize.caption,
    fontWeight: '800',
    letterSpacing: 1,
  },
  dropTitle: {
    fontSize: fontSize.headline,
    fontWeight: '900',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
