import type { PublicHunterProfile } from '@aurafit/shared';
import type { ProfileRow } from './types';

/**
 * Columns a public rank card / public profile page may read. Already public via the
 * leaderboard and the anon SELECT grant; deliberately excludes auth_id, avatar_url, bio,
 * fitness goal/level, onboarding and activity dates.
 */
export const PUBLIC_PROFILE_COLUMNS =
  'username, handle, role, aura_points, level, str_stat, agi_stat, end_stat, rec_stat, streak_days, total_workouts';

export type PublicProfileRow = Pick<
  ProfileRow,
  'username' | 'handle' | 'role' | 'aura_points' | 'level' | 'str_stat' | 'agi_stat' | 'end_stat' | 'rec_stat' | 'streak_days' | 'total_workouts'
>;

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? n : 0;
};

export function rowToPublicProfile(row: PublicProfileRow): PublicHunterProfile {
  return {
    username: row.username,
    handle: row.handle,
    role: row.role,
    auraPoints: num(row.aura_points),
    level: num(row.level) || 1,
    attributes: { str: num(row.str_stat), agi: num(row.agi_stat), end: num(row.end_stat), rec: num(row.rec_stat) },
    streakDays: num(row.streak_days),
    totalWorkouts: num(row.total_workouts),
  };
}
