'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { parseJSON, readStorage, writeStorage } from '@/lib/storage';

/**
 * useState backed by localStorage.
 *
 * - The first render always uses `initial` (matches SSR, no hydration mismatch).
 * - Saved data is read once after mount and validated with `validate`.
 * - Writes are skipped until hydration has finished, so defaults can never
 *   overwrite saved data (the race in the v1 implementation).
 * - Changes made in other tabs are picked up via the `storage` event.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  validate: (v: unknown) => v is T,
  legacyKey?: string,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  const validateRef = useRef(validate);
  validateRef.current = validate;

  useEffect(() => {
    const saved = readStorage(key, validateRef.current, legacyKey);
    if (saved !== undefined) setValue(saved);
    setHydrated(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      const next = parseJSON(e.newValue, validateRef.current);
      if (next !== undefined) setValue(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, legacyKey]);

  useEffect(() => {
    if (hydrated) writeStorage(key, value);
  }, [hydrated, key, value]);

  const set = useCallback<Dispatch<SetStateAction<T>>>((action) => setValue(action), []);
  return [value, set, hydrated];
}
