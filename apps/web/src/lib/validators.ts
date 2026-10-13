import { toIconKey, type Quest, type UserProfile, type UserRole, type WorkoutDrop } from '@aurafit/shared';

type Rec = Record<string, unknown>;

const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

export const isBoolean = isBool;

export function isUserRole(v: unknown): v is UserRole {
  return v === 'MEMBER' || v === 'CREATOR' || v === 'ADMIN';
}

export function isUserProfile(v: unknown): v is UserProfile {
  if (!isObj(v)) return false;
  const a = v.attributes;
  return (
    isStr(v.id) &&
    isStr(v.username) &&
    isStr(v.handle) &&
    isUserRole(v.role) &&
    isStr(v.avatarUrl) &&
    isStr(v.title) &&
    isNum(v.auraPoints) &&
    isNum(v.level) &&
    isNum(v.streakDays) &&
    isNum(v.streakShields) &&
    isNum(v.totalWorkouts) &&
    isNum(v.weeklyAuraGained) &&
    isObj(a) &&
    isNum(a.str) &&
    isNum(a.agi) &&
    isNum(a.end) &&
    isNum(a.rec)
  );
}

const STATS = new Set(['str', 'agi', 'end', 'rec']);

function isQuest(v: unknown): v is Quest {
  if (!isObj(v)) return false;
  const r = v.statReward;
  const valid =
    isStr(v.id) &&
    isStr(v.title) &&
    isStr(v.subtitle) &&
    isNum(v.auraReward) &&
    isNum(v.durationMinutes) &&
    isBool(v.completed) &&
    isNum(v.targetCount) &&
    isObj(r) &&
    isStr(r.stat) &&
    STATS.has(r.stat) &&
    isNum(r.amount);
  // Saved demo state from older builds stores emoji (or nothing) as the icon. Rather than
  // rejecting the whole quest list, normalise it to an icon key in place; `v` is freshly
  // parsed JSON owned by the caller, so mutating it is safe.
  if (valid) v.icon = toIconKey(v.icon);
  return valid;
}

function isExercise(v: unknown): boolean {
  return isObj(v) && isStr(v.id) && isStr(v.name) && isStr(v.targetMuscle) && isStr(v.repsOrSeconds) && isStr(v.tips);
}

function isWorkoutDrop(v: unknown): v is WorkoutDrop {
  if (!isObj(v)) return false;
  return (
    isStr(v.id) &&
    isStr(v.title) &&
    isStr(v.tagline) &&
    isStr(v.creatorId) &&
    isStr(v.creatorName) &&
    isStr(v.creatorAvatar) &&
    isStr(v.vibeTag) &&
    isNum(v.durationMinutes) &&
    isNum(v.caloriesBurnEstimate) &&
    isNum(v.auraMultiplier) &&
    isNum(v.xpPoints) &&
    isNum(v.likesCount) &&
    isNum(v.completionsCount) &&
    Array.isArray(v.exercises) &&
    v.exercises.length > 0 &&
    v.exercises.every(isExercise)
  );
}

export function isQuestArray(v: unknown): v is Quest[] {
  return Array.isArray(v) && v.every(isQuest);
}

export function isWorkoutDropArray(v: unknown): v is WorkoutDrop[] {
  return Array.isArray(v) && v.every(isWorkoutDrop);
}
