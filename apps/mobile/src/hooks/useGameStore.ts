import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserProfile, UserRole, WorkoutDrop } from '@aurafit/shared';
import { toDateKey } from '../lib/date';
import {
  STORAGE_KEY,
  createInitialState,
  deserialize,
  gameReducer,
  serialize,
  type GameState,
} from '../lib/gameState';
import type { ThemePreference } from '../theme/ThemeProvider';

export interface GameStore {
  state: GameState;
  /** False until persisted state has been read; nothing is written before this flips. */
  hydrated: boolean;
  setRole: (role: UserRole) => void;
  setTheme: (preference: ThemePreference) => void;
  completeQuest: (questId: string) => void;
  finishWorkout: (drop: WorkoutDrop) => void;
  /** Clears all local progress (seed data again); the theme preference is kept. */
  resetGame: () => void;
  updateProfile: (patch: Pick<UserProfile, 'username' | 'title' | 'bio'>) => void;
}

const SAVE_DEBOUNCE_MS = 300;

export function useGameStore(): GameStore {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialState(toDateKey()));
  const [hydrated, setHydrated] = useState(false);
  const lastSaved = useRef<string | null>(null);

  // Load once. The `active` flag prevents state updates if the root unmounts mid-read.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!active) return;
        lastSaved.current = raw;
        dispatch({ type: 'HYDRATE', state: deserialize(raw, toDateKey()) });
      })
      .catch((err: unknown) => {
        if (__DEV__) console.warn('[aurafit] failed to load saved state', err);
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Persist after hydration only, so defaults never overwrite saved progress.
  useEffect(() => {
    if (!hydrated) return;
    const json = serialize(state);
    if (json === lastSaved.current) return;
    const id = setTimeout(() => {
      lastSaved.current = json;
      AsyncStorage.setItem(STORAGE_KEY, json).catch((err: unknown) => {
        lastSaved.current = null;
        if (__DEV__) console.warn('[aurafit] failed to save state', err);
      });
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [state, hydrated]);

  // Flush immediately when the app is backgrounded (the OS may kill it before the debounce fires),
  // and roll daily quests / streak over when returning on a new day.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    if (!hydrated) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        dispatch({ type: 'DAY_ROLLOVER', today: toDateKey() });
      } else if (next === 'background') {
        const json = serialize(stateRef.current);
        if (json !== lastSaved.current) {
          lastSaved.current = json;
          AsyncStorage.setItem(STORAGE_KEY, json).catch(() => {
            lastSaved.current = null;
          });
        }
      }
    });
    return () => sub.remove();
  }, [hydrated]);

  const setRole = useCallback((role: UserRole) => dispatch({ type: 'SET_ROLE', role }), []);
  const setTheme = useCallback(
    (preference: ThemePreference) => dispatch({ type: 'SET_THEME', preference }),
    []
  );
  const completeQuest = useCallback(
    (questId: string) => dispatch({ type: 'COMPLETE_QUEST', questId, today: toDateKey() }),
    []
  );
  const finishWorkout = useCallback(
    (drop: WorkoutDrop) => dispatch({ type: 'FINISH_WORKOUT', drop, today: toDateKey() }),
    []
  );

  const resetGame = useCallback(() => dispatch({ type: 'RESET', today: toDateKey() }), []);
  const updateProfile = useCallback(
    (patch: Pick<UserProfile, 'username' | 'title' | 'bio'>) => dispatch({ type: 'UPDATE_PROFILE', patch }),
    []
  );

  return useMemo(
    () => ({ state, hydrated, setRole, setTheme, completeQuest, finishWorkout, resetGame, updateProfile }),
    [state, hydrated, setRole, setTheme, completeQuest, finishWorkout, resetGame, updateProfile]
  );
}
