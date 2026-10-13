import {
  INITIAL_QUESTS,
  INITIAL_USER,
  calculateAuraGain,
  getRankFromAura,
  hasPermission,
  type Quest,
  type UserProfile,
  type UserRole,
  type WorkoutDrop,
} from '@aurafit/shared';
import type { ThemePreference } from '../theme/ThemeProvider';
import { addDays, daysBetween, isDateKey } from './date';

export interface GameState {
  themePreference: ThemePreference;
  role: UserRole;
  user: UserProfile;
  quests: Quest[];
  /** Last local day the user completed a quest or workout (drives the streak). */
  lastActiveDate: string | null;
  /** Local day the daily quests belong to; daily quests reset when this changes. */
  questDate: string;
}

export type GameAction =
  | { type: 'HYDRATE'; state: GameState }
  | { type: 'SET_ROLE'; role: UserRole }
  | { type: 'SET_THEME'; preference: ThemePreference }
  | { type: 'COMPLETE_QUEST'; questId: string; today: string }
  | { type: 'FINISH_WORKOUT'; drop: WorkoutDrop; today: string }
  | { type: 'DAY_ROLLOVER'; today: string };

const DAILY_CATEGORIES: ReadonlySet<Quest['category']> = new Set(['DAILY_QUEST', 'MOVEMENT_SNACK']);
const ROLES: readonly UserRole[] = ['MEMBER', 'CREATOR', 'ADMIN'];

export function createInitialState(today: string): GameState {
  return {
    themePreference: null,
    role: INITIAL_USER.role,
    user: withDerivedRank(INITIAL_USER),
    quests: INITIAL_QUESTS.map((q) => ({ ...q })),
    // Seed profile already has a running streak; treat yesterday as its last active day so the
    // first action today continues it rather than resetting it.
    lastActiveDate: addDays(today, -1),
    questDate: today,
  };
}

function withDerivedRank(user: UserProfile): UserProfile {
  const { rank } = getRankFromAura(user.auraPoints);
  return rank === user.rank ? user : { ...user, rank };
}

/**
 * Applies day-change effects: resets daily quests, and breaks the streak (or spends streak
 * shields) when one or more days were missed.
 */
function rollover(state: GameState, today: string): GameState {
  let next = state;

  if (state.questDate !== today) {
    next = {
      ...next,
      questDate: today,
      quests: next.quests.map((q) =>
        DAILY_CATEGORIES.has(q.category) ? { ...q, completed: false, progress: 0, currentCount: 0 } : q
      ),
    };
  }

  if (next.lastActiveDate) {
    const gap = daysBetween(next.lastActiveDate, today);
    if (Number.isFinite(gap) && gap > 1) {
      const missed = gap - 1;
      if (missed <= next.user.streakShields) {
        next = {
          ...next,
          user: { ...next.user, streakShields: next.user.streakShields - missed },
          lastActiveDate: addDays(today, -1),
        };
      } else if (next.user.streakDays !== 0) {
        next = { ...next, user: { ...next.user, streakDays: 0 } };
      }
    }
  }

  return next;
}

/** Records activity for `today`: extends the streak once per calendar day. */
function recordActivity(state: GameState, today: string): GameState {
  const gap = state.lastActiveDate ? daysBetween(state.lastActiveDate, today) : Number.NaN;
  if (Number.isFinite(gap) && gap <= 0) return state; // already active today (or clock skew)
  const streakDays = gap === 1 ? state.user.streakDays + 1 : 1;
  return { ...state, lastActiveDate: today, user: { ...state.user, streakDays } };
}

function grantAura(user: UserProfile, amount: number): UserProfile {
  return withDerivedRank({
    ...user,
    auraPoints: user.auraPoints + amount,
    weeklyAuraGained: user.weeklyAuraGained + amount,
  });
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'HYDRATE':
      return action.state;

    case 'SET_ROLE':
      if (state.role === action.role) return state;
      return { ...state, role: action.role, user: { ...state.user, role: action.role } };

    case 'SET_THEME':
      return state.themePreference === action.preference
        ? state
        : { ...state, themePreference: action.preference };

    case 'DAY_ROLLOVER':
      return rollover(state, action.today);

    case 'COMPLETE_QUEST': {
      if (!hasPermission(state.role, 'DO_QUESTS')) return state;
      const current = rollover(state, action.today);
      const quest = current.quests.find((q) => q.id === action.questId);
      // Checked against reducer state, so a rapid double-tap can never award twice.
      if (!quest || quest.completed) return current;

      const earned = calculateAuraGain(quest.auraReward, current.user.streakDays);
      const { stat, amount } = quest.statReward;
      const next: GameState = {
        ...current,
        quests: current.quests.map((q) =>
          q.id === quest.id ? { ...q, completed: true, progress: 100, currentCount: q.targetCount } : q
        ),
        user: {
          ...grantAura(current.user, earned),
          attributes: { ...current.user.attributes, [stat]: current.user.attributes[stat] + amount },
        },
      };
      return recordActivity(next, action.today);
    }

    case 'FINISH_WORKOUT': {
      if (!hasPermission(state.role, 'START_WORKOUT')) return state;
      const current = rollover(state, action.today);
      const earned = calculateAuraGain(
        action.drop.xpPoints,
        current.user.streakDays,
        action.drop.auraMultiplier
      );
      const next: GameState = {
        ...current,
        user: { ...grantAura(current.user, earned), totalWorkouts: current.user.totalWorkouts + 1 },
      };
      return recordActivity(next, action.today);
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Persistence (de)serialisation
// ---------------------------------------------------------------------------

export const STORAGE_KEY = 'aurafit:game-state:v1';
const SCHEMA_VERSION = 1;

interface PersistedQuestProgress {
  id: string;
  completed: boolean;
  progress: number;
  currentCount: number;
}

interface PersistedState {
  v: number;
  themePreference: ThemePreference;
  role: UserRole;
  user: UserProfile;
  quests: PersistedQuestProgress[];
  lastActiveDate: string | null;
  questDate: string;
}

export function serialize(state: GameState): string {
  const payload: PersistedState = {
    v: SCHEMA_VERSION,
    themePreference: state.themePreference,
    role: state.role,
    user: state.user,
    quests: state.quests.map(({ id, completed, progress, currentCount }) => ({
      id,
      completed,
      progress,
      currentCount,
    })),
    lastActiveDate: state.lastActiveDate,
    questDate: state.questDate,
  };
  return JSON.stringify(payload);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Parses persisted JSON defensively. Quest definitions always come from the current seed data
 * (so content updates ship with the app); only per-quest progress is restored. Any malformed
 * field falls back to the default rather than crashing the app.
 */
export function deserialize(raw: string | null, today: string): GameState {
  const defaults = createInitialState(today);
  if (!raw) return defaults;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }
  if (!isObj(parsed) || parsed.v !== SCHEMA_VERSION) return defaults;

  const role = ROLES.includes(parsed.role as UserRole) ? (parsed.role as UserRole) : defaults.role;
  const themePreference: ThemePreference =
    parsed.themePreference === 'dark' || parsed.themePreference === 'light' ? parsed.themePreference : null;

  let user = defaults.user;
  if (isObj(parsed.user) && isNum(parsed.user.auraPoints) && isObj(parsed.user.attributes)) {
    const u = parsed.user as unknown as UserProfile;
    user = withDerivedRank({
      ...defaults.user,
      ...u,
      role,
      attributes: { ...defaults.user.attributes, ...u.attributes },
      streakDays: isNum(u.streakDays) ? Math.max(0, Math.floor(u.streakDays)) : defaults.user.streakDays,
      streakShields: isNum(u.streakShields) ? Math.max(0, Math.floor(u.streakShields)) : 0,
    });
  }

  const savedProgress = new Map<string, PersistedQuestProgress>();
  if (Array.isArray(parsed.quests)) {
    for (const q of parsed.quests) {
      if (isObj(q) && typeof q.id === 'string') savedProgress.set(q.id, q as unknown as PersistedQuestProgress);
    }
  }
  const quests = defaults.quests.map((q) => {
    const saved = savedProgress.get(q.id);
    if (!saved) return q;
    return {
      ...q,
      completed: saved.completed === true,
      progress: isNum(saved.progress) ? Math.min(100, Math.max(0, saved.progress)) : q.progress,
      currentCount: isNum(saved.currentCount) ? Math.max(0, saved.currentCount) : q.currentCount,
    };
  });

  const restored: GameState = {
    themePreference,
    role,
    user,
    quests,
    lastActiveDate: isDateKey(parsed.lastActiveDate) ? parsed.lastActiveDate : null,
    questDate: isDateKey(parsed.questDate) ? parsed.questDate : today,
  };

  return rollover(restored, today);
}
