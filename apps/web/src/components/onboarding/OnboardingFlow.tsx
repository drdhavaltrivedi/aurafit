'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BellOff,
  CalendarCheck,
  Clock,
  Dumbbell,
  Flame,
  HeartPulse,
  Loader2,
  PersonStanding,
  Play,
  ShieldCheck,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Swords,
  Timer,
  type LucideIcon,
} from 'lucide-react';
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
  type WorkoutDrop,
} from '@aurafit/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { cx } from '@/lib/cx';
import { arenaStartHref, POST_ONBOARDING_PATH } from '@/lib/onboarding/gate';
import { saveReminderSettings, updateMe, type ReminderSaveOutcome } from '@/lib/onboarding/client';

export type OnboardingDrop = Pick<
  WorkoutDrop,
  'id' | 'title' | 'tagline' | 'durationMinutes' | 'difficulty' | 'category' | 'coverGradient'
>;

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
const NO_REMINDER = 'none';

interface Props {
  initialUsername: string;
  drops: OnboardingDrop[];
}

export function OnboardingFlow({ initialUsername, drops }: Props) {
  const ids = useId();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [username, setUsername] = useState(initialUsername);
  const [goal, setGoal] = useState<FitnessGoal | null>(null);
  const [level, setLevel] = useState<FitnessLevel | null>(null);
  const [reminder, setReminder] = useState<string>(String(ONBOARDING_DEFAULT_REMINDER_HOUR));
  const [streakSaver, setStreakSaver] = useState(true);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reminderOutcome, setReminderOutcome] = useState<ReminderSaveOutcome | null>(null);
  const [finalName, setFinalName] = useState(initialUsername);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  // Move focus to the new step's heading so screen readers announce it and keyboard users
  // continue from the top of the step (not on page load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const index = ONBOARDING_STEPS.indexOf(step);
  const recommended = useMemo(() => {
    const id = recommendFirstWorkout(goal, level, drops);
    return drops.find((d) => d.id === id) ?? null;
  }, [goal, level, drops]);

  const go = (next: OnboardingStep) => {
    setFieldError(null);
    setSubmitError(null);
    setStep(next);
  };
  const back = () => go(ONBOARDING_STEPS[Math.max(0, index - 1)]);

  const onWelcome = (e: FormEvent) => {
    e.preventDefault();
    const n = normalizeUsername(username);
    if (!n.ok) {
      setFieldError(n.error);
      return;
    }
    setUsername(n.value);
    go('goal');
  };
  const onGoal = (e: FormEvent) => {
    e.preventDefault();
    if (!goal) setFieldError('Pick the goal that fits you best.');
    else go('level');
  };
  const onLevel = (e: FormEvent) => {
    e.preventDefault();
    if (!level) setFieldError('Pick your current level.');
    else go('reminder');
  };

  const finish = async (hour: number | null) => {
    if (busy || !goal || !level) return;
    setBusy(true);
    setSubmitError(null);
    const name = normalizeUsername(username);
    const res = await updateMe({
      fitnessGoal: goal,
      fitnessLevel: level,
      ...(name.ok && name.value !== initialUsername ? { username: name.value } : {}),
      completeOnboarding: true,
    });
    if (!res.ok) {
      setBusy(false);
      setSubmitError(res.message || "Couldn't save your answers. Please try again.");
      return;
    }
    setFinalName(res.data.profile.username);
    // Owned by the streak-saver push feature; never blocks finishing onboarding.
    setReminderOutcome(await saveReminderSettings(hour, streakSaver));
    setBusy(false);
    go('done');
  };
  const onReminder = (e: FormEvent) => {
    e.preventDefault();
    void finish(reminder === NO_REMINDER ? null : Number(reminder));
  };

  const errorId = `${ids}-error`;
  const headingId = `${ids}-heading`;
  const progressId = `${ids}-progress`;
  const fieldErrorEl = fieldError ? (
    <p id={errorId} className="field__error" role="alert">
      {fieldError}
    </p>
  ) : null;

  let body: ReactNode;
  if (step === 'welcome') {
    body = (
      <form className="stack-6" onSubmit={onWelcome} noValidate>
        <StepHeading id={headingId} headingRef={headingRef} eyebrow="Welcome, hunter" title="Let's set up your arena">
          Four quick questions so your first quest fits you. It takes under a minute.
        </StepHeading>
        <div className="field">
          <label htmlFor={`${ids}-name`} className="field__label">
            Display name
          </label>
          <input
            id={`${ids}-name`}
            className="input"
            name="username"
            autoComplete="nickname"
            maxLength={50}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? errorId : `${ids}-name-hint`}
          />
          {fieldErrorEl ?? (
            <p id={`${ids}-name-hint`} className="field__hint">
              Shown on leaderboards and your hunter card. You can change it later.
            </p>
          )}
        </div>
        <StepActions>
          <Button type="submit" size="lg" trailingIcon={<ArrowRight />} data-testid="onboarding-next">
            Continue
          </Button>
        </StepActions>
      </form>
    );
  } else if (step === 'goal') {
    body = (
      <form className="stack-6" onSubmit={onGoal} noValidate>
        <StepHeading id={headingId} headingRef={headingRef} eyebrow="Your goal" title="What brings you to AuraFit?">
          We use this to pick your first workout.
        </StepHeading>
        <fieldset className="choice-group" aria-describedby={fieldError ? errorId : undefined}>
          <legend className="sr-only">Fitness goal</legend>
          {FITNESS_GOALS.map((g) => (
            <Choice
              key={g}
              name={`${ids}-goal`}
              value={g}
              checked={goal === g}
              onChange={() => {
                setGoal(g);
                setFieldError(null);
              }}
              icon={GOAL_ICONS[g]}
              label={FITNESS_GOAL_META[g].label}
              description={FITNESS_GOAL_META[g].description}
            />
          ))}
        </fieldset>
        {fieldErrorEl}
        <StepActions onBack={back}>
          <Button type="submit" size="lg" trailingIcon={<ArrowRight />} data-testid="onboarding-next">
            Continue
          </Button>
        </StepActions>
      </form>
    );
  } else if (step === 'level') {
    body = (
      <form className="stack-6" onSubmit={onLevel} noValidate>
        <StepHeading id={headingId} headingRef={headingRef} eyebrow="Your level" title="How much do you train right now?">
          Be honest: we will never start you on something brutal.
        </StepHeading>
        <fieldset className="choice-group" aria-describedby={fieldError ? errorId : undefined}>
          <legend className="sr-only">Fitness level</legend>
          {FITNESS_LEVELS.map((l) => (
            <Choice
              key={l}
              name={`${ids}-level`}
              value={l}
              checked={level === l}
              onChange={() => {
                setLevel(l);
                setFieldError(null);
              }}
              icon={LEVEL_ICONS[l]}
              label={FITNESS_LEVEL_META[l].label}
              description={FITNESS_LEVEL_META[l].description}
            />
          ))}
        </fieldset>
        {fieldErrorEl}
        <StepActions onBack={back}>
          <Button type="submit" size="lg" trailingIcon={<ArrowRight />} data-testid="onboarding-next">
            Continue
          </Button>
        </StepActions>
      </form>
    );
  } else if (step === 'reminder') {
    body = (
      <form className="stack-6" onSubmit={onReminder} noValidate aria-busy={busy}>
        <StepHeading id={headingId} headingRef={headingRef} eyebrow="Optional" title="When should we nudge you?">
          Pick a daily reminder time in your local time zone, or skip it.
        </StepHeading>
        <fieldset className="choice-group choice-group--compact">
          <legend className="sr-only">Daily reminder time</legend>
          {ONBOARDING_REMINDER_HOURS.map((h) => (
            <Choice
              key={h}
              name={`${ids}-hour`}
              value={String(h)}
              checked={reminder === String(h)}
              onChange={() => setReminder(String(h))}
              icon={Clock}
              label={formatOnboardingHour(h)}
            />
          ))}
          <Choice
            name={`${ids}-hour`}
            value={NO_REMINDER}
            checked={reminder === NO_REMINDER}
            onChange={() => setReminder(NO_REMINDER)}
            icon={BellOff}
            label="No daily reminder"
          />
        </fieldset>
        <div className="callout onboarding__saver">
          <label className="onboarding__check">
            <input
              type="checkbox"
              checked={streakSaver}
              onChange={(e) => setStreakSaver(e.target.checked)}
              aria-describedby={`${ids}-saver-hint`}
            />
            <span className="fw-700">
              <ShieldCheck aria-hidden="true" className="icon-inline text-emerald" /> Streak saver
            </span>
          </label>
          <p id={`${ids}-saver-hint`} className="text-sm text-secondary">
            If you have a streak going and haven&apos;t trained by the evening, we send one push to your phone so you
            don&apos;t lose it. Never more than once a day. Change it any time in settings.
          </p>
        </div>
        {submitError && (
          <p className="alert alert--error" role="alert">
            {submitError}
          </p>
        )}
        <StepActions onBack={busy ? undefined : back}>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            disabled={busy}
            onClick={() => {
              setReminder(NO_REMINDER);
              void finish(null);
            }}
          >
            Skip for now
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={busy}
            aria-disabled={busy}
            leadingIcon={busy ? <Loader2 className="spin" /> : undefined}
            trailingIcon={busy ? undefined : <ArrowRight />}
            data-testid="onboarding-finish"
          >
            {busy ? 'Saving…' : 'Finish setup'}
          </Button>
        </StepActions>
      </form>
    );
  } else {
    body = (
      <div className="stack-6">
        <StepHeading id={headingId} headingRef={headingRef} eyebrow="You're in" title={`Ready, ${finalName}?`}>
          Your first quest is picked for your goal and level. Finish it to start your streak.
        </StepHeading>
        {reminderOutcome === 'failed' && (
          <p className="alert alert--info" role="status">
            We couldn&apos;t save your reminder settings. You can set them later from your phone&apos;s settings screen.
          </p>
        )}
        {recommended ? (
          <article className="onboarding__drop" aria-labelledby={`${ids}-drop`}>
            <div
              className="onboarding__drop-cover"
              style={{ backgroundImage: `linear-gradient(135deg, ${recommended.coverGradient[0]}, ${recommended.coverGradient[1]})` }}
              aria-hidden="true"
            >
              <Swords />
            </div>
            <div className="onboarding__drop-body">
              <p className="eyebrow text-accent">Recommended first workout</p>
              <h2 id={`${ids}-drop`} className="onboarding__drop-title">
                {recommended.title}
              </h2>
              {recommended.tagline && <p className="text-sm text-secondary">{recommended.tagline}</p>}
              <p className="onboarding__drop-meta">
                <span>
                  <Timer aria-hidden="true" className="icon-inline" /> {recommended.durationMinutes} min
                </span>
                <Badge tone="neutral" size="sm" outline>
                  {recommended.difficulty}
                </Badge>
              </p>
            </div>
          </article>
        ) : (
          <p className="text-secondary">Your arena is ready. Pick any workout to start your streak.</p>
        )}
        <div className="btn-row onboarding__actions">
          {recommended && (
            <Link href={arenaStartHref(recommended.id)} prefetch={false} className="btn btn--primary btn--lg" data-testid="onboarding-start-now">
              <span className="btn__icon" aria-hidden="true">
                <Play />
              </span>
              Start now
            </Link>
          )}
          <Link
            href={POST_ONBOARDING_PATH}
            prefetch={false}
            className={cx('btn btn--lg', recommended ? 'btn--secondary' : 'btn--primary')}
            data-testid="onboarding-go-arena"
          >
            Go to Arena
          </Link>
        </div>
      </div>
    );
  }

  const progressStep = Math.min(index + 1, ONBOARDING_PROGRESS_STEPS);
  return (
    <Card as="section" variant="feature" className="onboarding__card" aria-labelledby={headingId}>
      {step !== 'done' && (
        <div className="onboarding__progress">
          <p id={progressId} className="text-xs text-secondary fw-700">
            Step {progressStep} of {ONBOARDING_PROGRESS_STEPS}
          </p>
          <ProgressBar
            value={progressStep}
            max={ONBOARDING_PROGRESS_STEPS}
            labelledBy={progressId}
            valueText={`Step ${progressStep} of ${ONBOARDING_PROGRESS_STEPS}: ${STEP_LABELS[step]}`}
            size="sm"
          />
          <ol className="onboarding__steps" aria-label="Setup steps">
            {(Object.keys(STEP_LABELS) as Array<keyof typeof STEP_LABELS>).map((s, i) => (
              <li key={s} className={cx(i < index && 'is-done', i === index && 'is-current')} aria-current={i === index ? 'step' : undefined}>
                {STEP_LABELS[s]}
              </li>
            ))}
          </ol>
        </div>
      )}
      <div aria-live="polite" className="sr-only">
        {step === 'done' ? 'Setup complete.' : `Step ${progressStep} of ${ONBOARDING_PROGRESS_STEPS}: ${STEP_LABELS[step]}`}
      </div>
      {body}
    </Card>
  );
}

function StepHeading({
  id,
  headingRef,
  eyebrow,
  title,
  children,
}: {
  id: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="stack-2">
      <p className="eyebrow text-accent">{eyebrow}</p>
      <h1 id={id} ref={headingRef} tabIndex={-1} className="page-title onboarding__title">
        {title}
      </h1>
      <p className="text-secondary">{children}</p>
    </div>
  );
}

function StepActions({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  return (
    <div className="onboarding__nav">
      {onBack ? (
        <Button variant="ghost" size="lg" onClick={onBack} leadingIcon={<ArrowLeft />} data-testid="onboarding-back">
          Back
        </Button>
      ) : (
        <span />
      )}
      <div className="btn-row">{children}</div>
    </div>
  );
}

function Choice({
  name,
  value,
  checked,
  onChange,
  icon: Icon,
  label,
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  icon: LucideIcon;
  label: string;
  description?: string;
}) {
  return (
    <label className={cx('choice', checked && 'is-selected')} data-testid={`choice-${value}`}>
      <input type="radio" className="choice__input" name={name} value={value} checked={checked} onChange={onChange} />
      <span className="choice__icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="choice__text">
        <span className="choice__label">{label}</span>
        {description && <span className="choice__description">{description}</span>}
      </span>
    </label>
  );
}
