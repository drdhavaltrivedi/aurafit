/** In-memory GameRepository + helpers for API route tests (not a test file itself). */
import { INITIAL_QUESTS, INITIAL_WORKOUT_DROPS, type LeaderboardHunter, type Squad, type WorkoutDrop } from '@aurafit/shared';
import type { CompleteActionInput, GameActionResult, GameRepository, ProfileRow, ProfileUpdate, QuestRow } from '@/lib/data/types';

export const AUTH_ID = '11111111-1111-4111-8111-111111111111';
export const PROFILE_ID = '99999999-9999-4999-8999-999999999999';

export function makeProfileRow(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: PROFILE_ID,
    auth_id: AUTH_ID,
    username: 'Jinwoo',
    handle: '@jinwoo',
    role: 'MEMBER',
    avatar_url: null,
    title: 'Hunter in Training',
    bio: null,
    aura_points: '950',
    rank: 'E-RANK',
    level: 1,
    str_stat: 50,
    agi_stat: 50,
    end_stat: 50,
    rec_stat: 50,
    streak_days: 4,
    streak_shields: 2,
    last_active_date: null,
    squad_id: null,
    gym_id: null,
    total_workouts: 0,
    weekly_aura_gained: 0,
    fitness_goal: null,
    fitness_level: null,
    onboarded_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

export const QUEST_ROWS: QuestRow[] = INITIAL_QUESTS.map((q) => ({
  id: q.id,
  title: q.title,
  subtitle: q.subtitle,
  category: q.category,
  aura_reward: q.auraReward,
  stat_reward_stat: q.statReward.stat,
  stat_reward_amount: q.statReward.amount,
  duration_minutes: q.durationMinutes,
  difficulty: q.difficulty,
  target_count: q.targetCount,
  unit: q.unit,
  icon: q.icon,
  accent_color: q.accentColor,
  description: q.description,
}));

export class FakeRepo implements GameRepository {
  profile: ProfileRow;
  drops: WorkoutDrop[] = INITIAL_WORKOUT_DROPS.map((d) => ({ ...d }));
  questLog = new Set<string>();
  workoutLog = new Set<string>();
  calls: { completeQuest: CompleteActionInput[]; completeWorkout: CompleteActionInput[]; createDrop: WorkoutDrop[]; deleteAuthUser: string[] } = {
    completeQuest: [],
    completeWorkout: [],
    createDrop: [],
    deleteAuthUser: [],
  };
  deleted = false;
  failWith: Error | null = null;

  constructor(profile: ProfileRow = makeProfileRow()) {
    this.profile = profile;
  }

  private guard() {
    if (this.failWith) throw this.failWith;
  }

  async getProfileByAuthId(authId: string) {
    this.guard();
    return !this.deleted && this.profile.auth_id === authId ? this.profile : null;
  }
  async listQuests() {
    this.guard();
    return QUEST_ROWS;
  }
  async getQuest(id: string) {
    this.guard();
    return QUEST_ROWS.find((q) => q.id === id) ?? null;
  }
  async listCompletedQuestIds(userId: string, dateKey: string) {
    return QUEST_ROWS.filter((q) => this.questLog.has(`${userId}|${q.id}|${dateKey}`)).map((q) => q.id);
  }
  async completeQuest(input: CompleteActionInput): Promise<GameActionResult> {
    this.guard();
    this.calls.completeQuest.push(input);
    const quest = QUEST_ROWS.find((q) => q.id === input.itemId);
    if (!quest) return { status: 'not_found' };
    const key = `${input.userId}|${input.itemId}|${input.dateKey}`;
    if (this.questLog.has(key)) return { status: 'already_completed' };
    this.questLog.add(key);
    const statCol = `${quest.stat_reward_stat}_stat` as 'str_stat';
    this.profile = {
      ...this.profile,
      aura_points: Number(this.profile.aura_points) + input.aura,
      [statCol]: Math.min(100, this.profile[statCol] + quest.stat_reward_amount),
      total_workouts: this.profile.total_workouts + 1,
    };
    return { status: 'completed', profile: this.profile };
  }
  async listDrops() {
    this.guard();
    return this.drops;
  }
  async getDrop(id: string) {
    this.guard();
    return this.drops.find((d) => d.id === id) ?? null;
  }
  async createDrop(drop: WorkoutDrop) {
    this.guard();
    this.calls.createDrop.push(drop);
    this.drops.unshift(drop);
    return drop;
  }
  async completeWorkout(input: CompleteActionInput): Promise<GameActionResult> {
    this.guard();
    this.calls.completeWorkout.push(input);
    const key = `${input.userId}|${input.itemId}|${input.dateKey}`;
    if (this.workoutLog.has(key)) return { status: 'already_completed' };
    this.workoutLog.add(key);
    this.profile = { ...this.profile, aura_points: Number(this.profile.aura_points) + input.aura };
    return { status: 'completed', profile: this.profile };
  }
  async leaderboard(limit: number): Promise<{ hunters: LeaderboardHunter[]; squads: Squad[] }> {
    this.guard();
    const hunters: LeaderboardHunter[] = [{ id: PROFILE_ID, username: 'Jinwoo', handle: '@jinwoo', avatarUrl: '', role: 'MEMBER', auraPoints: 950, rank: 'E-RANK', level: 1, streakDays: 4, totalWorkouts: 0 }];
    return { hunters: hunters.slice(0, limit), squads: [] };
  }
  async deleteAuthUser(authId: string) {
    this.guard();
    this.calls.deleteAuthUser.push(authId);
    if (this.profile.auth_id === authId) this.deleted = true;
  }
  updateProfileCalls: Array<{ profileId: string; patch: ProfileUpdate }> = [];
  async updateProfile(profileId: string, patch: ProfileUpdate) {
    this.guard();
    this.updateProfileCalls.push({ profileId, patch });
    if (this.deleted || this.profile.id !== profileId) return null;
    this.profile = {
      ...this.profile,
      ...(patch.username !== undefined ? { username: patch.username } : {}),
      ...(patch.fitnessGoal !== undefined ? { fitness_goal: patch.fitnessGoal } : {}),
      ...(patch.fitnessLevel !== undefined ? { fitness_level: patch.fitnessLevel } : {}),
      ...(patch.completeOnboarding && !this.profile.onboarded_at ? { onboarded_at: new Date().toISOString() } : {}),
    };
    return this.profile;
  }
}
