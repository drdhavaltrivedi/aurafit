'use client';

import { useCallback, useState } from 'react';
import { ArrowRight, Lightbulb, Pause, Play, RotateCcw, Swords } from 'lucide-react';
import type { WorkoutDrop } from '@aurafit/shared';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useWorkoutTimer } from '@/hooks/useWorkoutTimer';
import { useToast } from '@/hooks/useToast';
import { SET_SECONDS } from '@/lib/drops';
import { sound } from '@/utils/audio';
import { cx } from '@/lib/cx';

interface WorkoutRunnerProps {
  drop: WorkoutDrop;
  onClose: () => void;
  onFinish: (drop: WorkoutDrop) => void;
}

/** Mounted only while a workout is active, so all timer state resets per session. */
export function WorkoutRunner({ drop, onClose, onFinish }: WorkoutRunnerProps) {
  const toast = useToast();
  const [index, setIndex] = useState(0);
  const total = drop.exercises.length;
  const exercise = drop.exercises[Math.min(index, total - 1)];
  const isLast = index >= total - 1;

  const timer = useWorkoutTimer({
    duration: SET_SECONDS,
    autoStart: true,
    onWarningTick: () => sound.playTimerTick(),
    onComplete: useCallback(() => {
      sound.playQuestComplete();
      toast.show(isLast ? 'Final set done! Claim your Aura.' : 'Set finished! Take a breather, then advance.', 'success');
    }, [isLast, toast]),
  });

  const next = () => {
    if (isLast) return;
    setIndex((i) => Math.min(i + 1, total - 1));
    timer.reset({ autoStart: true });
    sound.playClick();
  };

  const finish = () => {
    timer.pause();
    onFinish(drop);
  };

  const urgent = timer.secondsLeft <= 5 && timer.secondsLeft > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={drop.title}
      eyebrow={
        <Badge tone="accent" size="sm">
          {drop.vibeTag} · {drop.auraMultiplier}× Aura
        </Badge>
      }
      description={`Exercise ${index + 1} of ${total}`}
      closeLabel="End workout"
    >
      <ProgressBar value={index + 1} max={total} label="Workout progress" valueText={`Exercise ${index + 1} of ${total}`} size="sm" />

      <div className="panel exercise" aria-live="polite">
        <p className="text-xs text-blue fw-700">Target: {exercise.targetMuscle}</p>
        <h3 className="exercise__name">{exercise.name}</h3>
        <p className="exercise__reps">{exercise.repsOrSeconds}</p>
        <p className="exercise__tip">
          <Lightbulb aria-hidden="true" className="icon-inline" /> {exercise.tips}
        </p>
      </div>

      <div className="timer">
        <div className={cx('timer__value', urgent && 'is-urgent')} role="timer">
          {timer.secondsLeft}
          <span className="timer__unit" aria-hidden="true">
            s
          </span>
          <span className="sr-only"> seconds remaining in set</span>
        </div>
        <ProgressBar value={timer.secondsLeft} max={SET_SECONDS} label="Set time remaining" tone={urgent ? 'danger' : 'accent'} size="xs" className="timer__bar" />
        <div className="btn-row btn-row--center">
          <Button
            variant={timer.running ? 'danger' : 'success'}
            onClick={timer.toggle}
            leadingIcon={timer.running ? <Pause /> : <Play />}
            aria-pressed={timer.running}
          >
            {timer.running ? 'Pause' : timer.secondsLeft === 0 ? 'Restart set' : 'Resume'}
          </Button>
          <Button variant="secondary" onClick={() => timer.reset()} leadingIcon={<RotateCcw />}>
            Reset ({SET_SECONDS}s)
          </Button>
        </div>
      </div>

      {isLast ? (
        <Button variant="success" size="lg" block onClick={finish} leadingIcon={<Swords />}>
          Finish workout &amp; claim Aura
        </Button>
      ) : (
        <Button size="lg" block onClick={next} trailingIcon={<ArrowRight />}>
          Next movement
        </Button>
      )}
    </Modal>
  );
}
