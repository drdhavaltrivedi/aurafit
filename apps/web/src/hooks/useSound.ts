'use client';

import { useCallback, useEffect } from 'react';
import { sound } from '@/utils/audio';
import { STORAGE_KEYS } from '@/lib/storage';
import { isBoolean } from '@/lib/validators';
import { usePersistentState } from './usePersistentState';

/** Persisted sound preference, kept in sync with the `sound` singleton. */
export function useSound() {
  const [enabled, setEnabled] = usePersistentState<boolean>(STORAGE_KEYS.sound, true, isBoolean);

  useEffect(() => {
    sound.installUnlockListeners();
  }, []);

  useEffect(() => {
    sound.setEnabled(enabled);
  }, [enabled]);

  const toggle = useCallback(() => {
    const next = !enabled;
    sound.setEnabled(next);
    setEnabled(next);
    if (next) sound.playClick();
  }, [enabled, setEnabled]);

  return { enabled, toggle };
}
