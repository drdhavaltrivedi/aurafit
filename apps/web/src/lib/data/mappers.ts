import {
  DEFAULT_SQUAD_ICON,
  getRankFromAura,
  toIconKey,
  type Exercise,
  type LeaderboardHunter,
  type Quest,
  type Squad,
  type UserProfile,
  type WorkoutDrop,
} from '@aurafit/shared';
import type { DropRow, ProfileRow, QuestRow, SquadRow } from './types';

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? n : 0;
};

/** Profile row → API `UserProfile` (camelCase; rank derived from aura; no auth_id). */
export function rowToProfile(row: ProfileRow): UserProfile {
  const auraPoints = num(row.aura_points);
  const profile: UserProfile = {
    id: row.id,
    username: row.username,
    handle: row.handle,
    role: row.role,
    avatarUrl: row.avatar_url ?? '',
    title: row.title ?? 'Hunter in Training',
    bio: row.bio ?? '',
    auraPoints,
    rank: getRankFromAura(auraPoints).rank,
    level: num(row.level) || 1,
    attributes: { str: num(row.str_stat), agi: num(row.agi_stat), end: num(row.end_stat), rec: num(row.rec_stat) },
    streakDays: num(row.streak_days),
    streakShields: num(row.streak_shields),
    totalWorkouts: num(row.total_workouts),
    weeklyAuraGained: num(row.weekly_aura_gained),
  };
  if (row.squad_id) profile.squadId = row.squad_id;
  if (row.gym_id) profile.gymId = row.gym_id;
  return profile;
}

export function rowToLeaderboardHunter(row: ProfileRow): LeaderboardHunter {
  const auraPoints = num(row.aura_points);
  const hunter: LeaderboardHunter = {
    id: row.id,
    username: row.username,
    handle: row.handle,
    avatarUrl: row.avatar_url ?? '',
    role: row.role,
    auraPoints,
    rank: getRankFromAura(auraPoints).rank,
    level: num(row.level) || 1,
    streakDays: num(row.streak_days),
    totalWorkouts: num(row.total_workouts),
  };
  if (row.squad_id) hunter.squadId = row.squad_id;
  return hunter;
}

export function rowToQuest(row: QuestRow, completed: boolean): Quest {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    category: row.category,
    auraReward: row.aura_reward,
    statReward: { stat: row.stat_reward_stat, amount: row.stat_reward_amount },
    durationMinutes: row.duration_minutes,
    difficulty: row.difficulty,
    completed,
    progress: completed ? 100 : 0,
    targetCount: row.target_count,
    currentCount: completed ? row.target_count : 0,
    unit: row.unit,
    icon: toIconKey(row.icon),
    accentColor: row.accent_color ?? '#8B5CF6',
    description: row.description ?? '',
  };
}

function toExercises(value: unknown): Exercise[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((e): Exercise[] => {
    if (!e || typeof e !== 'object') return [];
    const o = e as Record<string, unknown>;
    const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
    if (!s('id') || !s('name')) return [];
    return [{ id: s('id'), name: s('name'), targetMuscle: s('targetMuscle'), repsOrSeconds: s('repsOrSeconds'), tips: s('tips') }];
  });
}

export function rowToDrop(row: DropRow): WorkoutDrop {
  return {
    id: row.id,
    title: row.title,
    tagline: row.tagline ?? '',
    creatorId: row.creator_id,
    creatorName: row.creator?.username ?? 'Unknown creator',
    creatorHandle: row.creator?.handle ?? '',
    creatorAvatar: row.creator?.avatar_url ?? '',
    creatorBadge: row.creator_badge,
    vibeTag: row.vibe_tag,
    durationMinutes: row.duration_minutes,
    caloriesBurnEstimate: row.calories_burn_estimate,
    auraMultiplier: num(row.aura_multiplier),
    xpPoints: row.xp_points,
    difficulty: row.difficulty,
    category: row.category,
    coverGradient: [row.cover_from, row.cover_to],
    exercises: toExercises(row.exercises),
    likesCount: row.likes_count,
    completionsCount: row.completions_count,
  };
}

/** WorkoutDrop → insertable row (server-controlled counters start at 0). */
export function dropToInsertRow(drop: WorkoutDrop) {
  return {
    id: drop.id,
    title: drop.title,
    tagline: drop.tagline,
    creator_id: drop.creatorId,
    vibe_tag: drop.vibeTag,
    duration_minutes: drop.durationMinutes,
    calories_burn_estimate: drop.caloriesBurnEstimate,
    aura_multiplier: drop.auraMultiplier,
    xp_points: drop.xpPoints,
    difficulty: drop.difficulty,
    category: drop.category,
    exercises: drop.exercises,
    cover_from: drop.coverGradient[0],
    cover_to: drop.coverGradient[1],
    creator_badge: drop.creatorBadge,
  };
}

export function rowToSquad(row: SquadRow, index: number): Squad {
  return {
    id: row.id,
    name: row.name,
    tag: row.tag,
    avatar: toIconKey(row.avatar, DEFAULT_SQUAD_ICON),
    totalAura: num(row.total_aura),
    rankPosition: index + 1,
    memberCount: row.member_count,
    maxMembers: row.max_members,
    leaderName: row.leader?.username ?? 'Unknown',
    streakDays: row.streak_days,
    weeklyGoalProgress: row.weekly_goal_progress,
    status: row.status,
  };
}
