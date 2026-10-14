/**
 * Profile editing rules (mirror the `profiles` table CHECKs: username 1–50 chars, title ≤ 100,
 * bio ≤ 500) and derived achievements. Pure so they can be unit-tested.
 */
import { RANK_ORDER, RANK_THRESHOLDS, type HunterRank, type UserProfile } from '@aurafit/shared';

export const USERNAME_MAX = 50;
export const TITLE_MAX = 100;
export const BIO_MAX = 500;

export interface ProfilePatch {
  username: string;
  title: string;
  bio: string;
}

export type ProfileErrors = Partial<Record<keyof ProfilePatch, string>>;

export function normalizeProfilePatch(p: ProfilePatch): ProfilePatch {
  return { username: p.username.trim(), title: p.title.trim(), bio: p.bio.trim() };
}

export function validateProfilePatch(p: ProfilePatch): ProfileErrors {
  const n = normalizeProfilePatch(p);
  const e: ProfileErrors = {};
  if (!n.username) e.username = 'Enter a hunter name.';
  else if (n.username.length > USERNAME_MAX) e.username = `Keep it to ${USERNAME_MAX} characters or fewer.`;
  if (n.title.length > TITLE_MAX) e.title = `Keep it to ${TITLE_MAX} characters or fewer.`;
  if (n.bio.length > BIO_MAX) e.bio = `Keep it to ${BIO_MAX} characters or fewer.`;
  return e;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  /** 0–100 progress towards unlocking. */
  progress: number;
  progressLabel: string;
}

const pct = (value: number, target: number) => Math.max(0, Math.min(100, Math.floor((value / target) * 100)));

const RANK_BADGES: HunterRank[] = RANK_ORDER.filter((r) => r !== 'E-RANK');
const STREAK_BADGES = [3, 7, 30];
/** `totalWorkouts` counts every completed session (quests and workout drops), as the server does. */
const SESSION_BADGES = [1, 10, 50];

/** Badges derived only from real profile fields (aura/rank, current streak, completed sessions). */
export function deriveAchievements(
  p: Pick<UserProfile, 'auraPoints' | 'streakDays' | 'totalWorkouts'>
): Achievement[] {
  const aura = Math.max(0, p.auraPoints);
  const ranks = RANK_BADGES.map((rank) => {
    const target = RANK_THRESHOLDS[rank];
    return {
      id: `rank-${rank}`,
      title: rank === 'MONARCH' ? 'Monarch' : `Reach ${rank}`,
      description: `Earn ${target.toLocaleString()} aura.`,
      unlocked: aura >= target,
      progress: pct(aura, target),
      progressLabel: `${Math.min(aura, target).toLocaleString()} / ${target.toLocaleString()} aura`,
    };
  });
  const streaks = STREAK_BADGES.map((days) => ({
    id: `streak-${days}`,
    title: `${days}-day streak`,
    description: `Be active ${days} days in a row.`,
    unlocked: p.streakDays >= days,
    progress: pct(p.streakDays, days),
    progressLabel: `Current streak ${p.streakDays} / ${days} days`,
  }));
  const sessions = SESSION_BADGES.map((n) => ({
    id: `sessions-${n}`,
    title: n === 1 ? 'First session' : `${n} sessions`,
    description: n === 1 ? 'Complete your first quest or workout.' : `Complete ${n} quests or workouts.`,
    unlocked: p.totalWorkouts >= n,
    progress: pct(p.totalWorkouts, n),
    progressLabel: `${Math.min(p.totalWorkouts, n)} / ${n} sessions`,
  }));
  return [...ranks, ...streaks, ...sessions];
}
