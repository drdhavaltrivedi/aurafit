import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

export type CountdownStatus = 'idle' | 'running' | 'paused' | 'done';

export interface Countdown {
  remaining: number;
  status: CountdownStatus;
  start: () => void;
  pause: () => void;
  reset: () => void;
}

/**
 * Wall-clock based countdown. The remaining time is derived from an absolute end timestamp,
 * so it stays correct when JS timers are throttled (app backgrounded, screen locked) and the
 * interval is always cleared on pause, completion, reset, duration change and unmount.
 */
export function useCountdown(durationSeconds: number, onDone?: () => void): Countdown {
  const [remaining, setRemaining] = useState(durationSeconds);
  const [status, setStatus] = useState<CountdownStatus>('idle');
  const endsAtRef = useRef<number | null>(null);
  const remainingRef = useRef(durationSeconds);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const tick = useCallback(() => {
    if (endsAtRef.current === null) return;
    const left = Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000));
    remainingRef.current = left;
    setRemaining(left);
    if (left === 0) {
      endsAtRef.current = null;
      setStatus('done');
      onDoneRef.current?.();
    }
  }, []);

  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(tick, 250);
    // Re-sync immediately when returning to the foreground.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [status, tick]);

  // A new duration (e.g. a different workout) resets the timer.
  useEffect(() => {
    endsAtRef.current = null;
    remainingRef.current = durationSeconds;
    setRemaining(durationSeconds);
    setStatus('idle');
  }, [durationSeconds]);

  const start = useCallback(() => {
    const from = remainingRef.current > 0 ? remainingRef.current : durationSeconds;
    remainingRef.current = from;
    setRemaining(from);
    endsAtRef.current = Date.now() + from * 1000;
    setStatus('running');
  }, [durationSeconds]);

  const pause = useCallback(() => {
    if (endsAtRef.current === null) return;
    const left = Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000));
    endsAtRef.current = null;
    remainingRef.current = left;
    setRemaining(left);
    setStatus(left === 0 ? 'done' : 'paused');
  }, []);

  const reset = useCallback(() => {
    endsAtRef.current = null;
    remainingRef.current = durationSeconds;
    setRemaining(durationSeconds);
    setStatus('idle');
  }, [durationSeconds]);

  return { remaining, status, start, pause, reset };
}
