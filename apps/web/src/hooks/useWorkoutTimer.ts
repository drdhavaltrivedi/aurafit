'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Options {
  /** Length of one interval in seconds. */
  duration: number;
  /** Start counting immediately on mount. */
  autoStart?: boolean;
  /** Fires once each time the countdown reaches zero. */
  onComplete?: () => void;
  /** Fires on each of the final `warnAt` seconds while running. */
  onWarningTick?: (secondsLeft: number) => void;
  warnAt?: number;
}

/**
 * Drift-free countdown. The remaining time is derived from a wall-clock end
 * timestamp, so background-tab throttling or slow renders never stretch a set.
 * The interval is cleared on pause, completion and unmount.
 */
export function useWorkoutTimer({ duration, autoStart = false, onComplete, onWarningTick, warnAt = 3 }: Options) {
  const [secondsLeft, setSecondsLeft] = useState(duration);
  const [running, setRunning] = useState(autoStart);

  const secondsRef = useRef(duration);
  const runningRef = useRef(autoStart);
  const endAtRef = useRef<number | null>(null);
  const prevRef = useRef(duration);
  const onCompleteRef = useRef(onComplete);
  const onWarnRef = useRef(onWarningTick);
  onCompleteRef.current = onComplete;
  onWarnRef.current = onWarningTick;

  secondsRef.current = secondsLeft;
  runningRef.current = running;

  useEffect(() => {
    if (!running) {
      endAtRef.current = null;
      return;
    }
    endAtRef.current = Date.now() + secondsRef.current * 1000;
    const id = window.setInterval(() => {
      const endAt = endAtRef.current;
      if (endAt == null) return;
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) setRunning(false);
    }, 200);
    return () => window.clearInterval(id);
  }, [running]);

  // Side effects react to committed values (never inside state updaters).
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = secondsLeft;
    if (secondsLeft === prev) return;
    if (secondsLeft === 0 && prev > 0) {
      onCompleteRef.current?.();
    } else if (secondsLeft < prev && secondsLeft > 0 && secondsLeft <= warnAt) {
      onWarnRef.current?.(secondsLeft);
    }
  }, [secondsLeft, warnAt]);

  const reset = useCallback(
    (opts?: { autoStart?: boolean }) => {
      secondsRef.current = duration;
      prevRef.current = duration;
      setSecondsLeft(duration);
      if (runningRef.current) endAtRef.current = Date.now() + duration * 1000;
      if (opts?.autoStart) setRunning(true);
    },
    [duration],
  );

  const start = useCallback(() => {
    if (secondsRef.current <= 0) {
      secondsRef.current = duration;
      prevRef.current = duration;
      setSecondsLeft(duration);
    }
    setRunning(true);
  }, [duration]);

  const pause = useCallback(() => setRunning(false), []);
  const toggle = useCallback(() => (runningRef.current ? pause() : start()), [pause, start]);

  return { secondsLeft, running, start, pause, toggle, reset, duration };
}
