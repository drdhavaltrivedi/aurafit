import type { FitnessGoal, FitnessLevel, LeaderboardHunter, PlayerAttributes, Quest, Squad, UserProfile, WorkoutDrop } from '@aurafit/shared';
import type { PublicHunterProfile } from '@aurafit/shared';

/** public.profiles row (snake_case, as returned by PostgREST / to_jsonb). */
export interface ProfileRow {
  id: string;
  auth_id: string | null;
  username: string;
  handle: string;
  role: 'MEMBER' | 'CREATOR' | 'ADMIN';
  avatar_url: string | null;
  title: string | null;
  bio: string | null;
  aura_points: number | string;
  rank: string;
  level: number;
  str_stat: number;
  agi_stat: number;
  end_stat: number;
  rec_stat: number;
  streak_days: number;
  streak_shields: number;
  last_active_date: string | null;
  squad_id: string | null;
  gym_id: string | null;
  total_workouts: number;
  weekly_aura_gained: number | string;
  /** Onboarding (20261014100000_onboarding.sql). onboarded_at NULL = not onboarded yet. */
  fitness_goal: FitnessGoal | null;
  fitness_level: FitnessLevel | null;
  onboarded_at: string | null;
}

export interface QuestRow {
  id: string;
  title: string;
  subtitle: string;
  category: Quest['category'];
  aura_reward: number;
  stat_reward_stat: keyof PlayerAttributes;
  stat_reward_amount: number;
  duration_minutes: number;
  difficulty: Quest['difficulty'];
  target_count: number;
  unit: string;
  icon: string;
  accent_color: string | null;
  description: string | null;
}

export interface DropRow {
  id: string;
  title: string;
  tagline: string | null;
  creator_id: string;
  vibe_tag: string;
  duration_minutes: number;
  calories_burn_estimate: number;
  aura_multiplier: number | string;
  xp_points: number;
  difficulty: WorkoutDrop['difficulty'];
  category: WorkoutDrop['category'];
  exercises: unknown;
  cover_from: string;
  cover_to: string;
  creator_badge: string;
  likes_count: number;
  completions_count: number;
  created_at?: string;
  /** Embedded creator (select=…,creator:profiles(...)). */
  creator?: Pick<ProfileRow, 'username' | 'handle' | 'avatar_url'> | null;
}

export type GameActionResult =
  | { status: 'completed'; profile: ProfileRow }
  | { status: 'already_completed' }
  | { status: 'not_found' }
  | { status: 'profile_not_found' };

export interface CompleteActionInput {
  /** profiles.id (not the auth user id). */
  userId: string;
  itemId: string;
  aura: number;
  /** UTC YYYY-MM-DD. */
  dateKey: string;
}

/**
 * Everything the v1 API needs from the database. Routes depend on this
 * interface only, so they can be unit-tested with an in-memory fake.
 */
export interface GameRepository {
  getProfileByAuthId(authId: string): Promise<ProfileRow | null>;
  listQuests(): Promise<QuestRow[]>;
  getQuest(id: string): Promise<QuestRow | null>;
  listCompletedQuestIds(userId: string, dateKey: string): Promise<string[]>;
  completeQuest(input: CompleteActionInput): Promise<GameActionResult>;
  listDrops(): Promise<WorkoutDrop[]>;
  getDrop(id: string): Promise<WorkoutDrop | null>;
  createDrop(drop: WorkoutDrop): Promise<WorkoutDrop>;
  completeWorkout(input: CompleteActionInput): Promise<GameActionResult>;
  leaderboard(limit: number): Promise<{ hunters: LeaderboardHunter[]; squads: Squad[] }>;
  /**
   * Public card fields for one profile by its stored handle ("@name", exact match), or null.
   * Selects public leaderboard columns only (never auth_id, email or onboarding answers).
   */
  getPublicProfileByHandle(handle: string): Promise<PublicHunterProfile | null>;
  /**
   * Permanently deletes the auth user (auth.users.id). The database cascades to the
   * profile, its quest/workout logs and its workout drops. Resolves when the user is
   * gone (including when it was already deleted).
   */
  deleteAuthUser(authId: string): Promise<void>;
  /**
   * Server-side profile update (PATCH /api/v1/me). `completeOnboarding` sets onboarded_at = now()
   * only if it is still NULL. Resolves with the updated row, or null if the profile is gone.
   */
  updateProfile(profileId: string, patch: ProfileUpdate): Promise<ProfileRow | null>;
}

export interface ProfileUpdate {
  username?: string;
  fitnessGoal?: FitnessGoal;
  fitnessLevel?: FitnessLevel;
  completeOnboarding?: boolean;
}

export type { UserProfile };
