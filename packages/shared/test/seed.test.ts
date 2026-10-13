import { describe, expect, it } from 'vitest';
import {
  ADMIN_USER,
  CREATOR_USER,
  getRankFromAura,
  INITIAL_GYM_LEADERBOARD,
  INITIAL_QUESTS,
  INITIAL_SQUADS,
  INITIAL_USER,
  INITIAL_WORKOUT_DROPS,
  ROLE_PERMISSIONS,
  type UserProfile,
} from '../src/index';

const USERS: UserProfile[] = [INITIAL_USER, CREATOR_USER, ADMIN_USER];
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function expectUnique(values: string[]) {
  expect(new Set(values).size).toBe(values.length);
}

describe('seed users', () => {
  it.each(USERS.map((u) => [u.id, u] as const))('%s: rank matches getRankFromAura(auraPoints)', (_id, user) => {
    expect(user.rank).toBe(getRankFromAura(user.auraPoints).rank);
  });

  it.each(USERS.map((u) => [u.id, u] as const))('%s: numeric fields are sane', (_id, user) => {
    expect(Number.isInteger(user.auraPoints)).toBe(true);
    expect(user.auraPoints).toBeGreaterThanOrEqual(0);
    expect(user.level).toBeGreaterThanOrEqual(1);
    expect(user.streakDays).toBeGreaterThanOrEqual(0);
    expect(user.streakShields).toBeGreaterThanOrEqual(0);
    expect(user.totalWorkouts).toBeGreaterThanOrEqual(0);
    expect(user.weeklyAuraGained).toBeGreaterThanOrEqual(0);
    expect(user.weeklyAuraGained).toBeLessThanOrEqual(user.auraPoints);
    for (const value of Object.values(user.attributes)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    expect(Object.keys(user.attributes).sort()).toEqual(['agi', 'end', 'rec', 'str']);
  });

  it('users have the role their name implies and a valid role', () => {
    expect(INITIAL_USER.role).toBe('MEMBER');
    expect(CREATOR_USER.role).toBe('CREATOR');
    expect(ADMIN_USER.role).toBe('ADMIN');
    for (const u of USERS) expect(ROLE_PERMISSIONS[u.role]).toBeDefined();
  });

  it('ids and handles are unique; handles start with @', () => {
    expectUnique(USERS.map((u) => u.id));
    expectUnique(USERS.map((u) => u.handle));
    for (const u of USERS) expect(u.handle.startsWith('@')).toBe(true);
  });

  it('avatar urls are https', () => {
    for (const u of USERS) expect(u.avatarUrl).toMatch(/^https:\/\//);
  });
});

describe('seed quests', () => {
  it('ids are unique', () => {
    expectUnique(INITIAL_QUESTS.map((q) => q.id));
  });

  it.each(INITIAL_QUESTS.map((q) => [q.id, q] as const))('%s: progress is consistent with counts', (_id, q) => {
    expect(q.targetCount).toBeGreaterThan(0);
    expect(q.currentCount).toBeGreaterThanOrEqual(0);
    expect(q.currentCount).toBeLessThanOrEqual(q.targetCount);
    expect(q.progress).toBeGreaterThanOrEqual(0);
    expect(q.progress).toBeLessThanOrEqual(100);
    expect(q.progress).toBe(Math.floor((q.currentCount / q.targetCount) * 100));
  });

  it.each(INITIAL_QUESTS.map((q) => [q.id, q] as const))('%s: completed <=> progress 100 <=> count reached', (_id, q) => {
    expect(q.completed).toBe(q.progress === 100);
    expect(q.completed).toBe(q.currentCount === q.targetCount);
  });

  it.each(INITIAL_QUESTS.map((q) => [q.id, q] as const))('%s: rewards and display fields are valid', (_id, q) => {
    expect(Number.isInteger(q.auraReward)).toBe(true);
    expect(q.auraReward).toBeGreaterThan(0);
    expect(['str', 'agi', 'end', 'rec']).toContain(q.statReward.stat);
    expect(q.statReward.amount).toBeGreaterThan(0);
    expect(q.durationMinutes).toBeGreaterThan(0);
    expect(q.accentColor).toMatch(HEX_COLOR);
    expect(q.title.length).toBeGreaterThan(0);
    expect(q.unit.length).toBeGreaterThan(0);
  });
});

describe('seed workout drops', () => {
  it('drop ids and exercise ids are unique', () => {
    expectUnique(INITIAL_WORKOUT_DROPS.map((d) => d.id));
    expectUnique(INITIAL_WORKOUT_DROPS.flatMap((d) => d.exercises.map((e) => e.id)));
  });

  it.each(INITIAL_WORKOUT_DROPS.map((d) => [d.id, d] as const))('%s: fields are sane', (_id, d) => {
    expect(d.exercises.length).toBeGreaterThan(0);
    expect(d.auraMultiplier).toBeGreaterThanOrEqual(1);
    expect(d.auraMultiplier).toBeLessThanOrEqual(9.9); // NUMERIC(3,1) in schema.sql
    expect(d.durationMinutes).toBeGreaterThan(0);
    expect(d.caloriesBurnEstimate).toBeGreaterThan(0);
    expect(d.xpPoints).toBeGreaterThan(0);
    expect(d.likesCount).toBeGreaterThanOrEqual(0);
    expect(d.completionsCount).toBeGreaterThanOrEqual(0);
    expect(d.creatorHandle.startsWith('@')).toBe(true);
    for (const c of d.coverGradient) expect(c).toMatch(HEX_COLOR);
  });

  it('drops attributed to a seeded creator match that creator', () => {
    for (const d of INITIAL_WORKOUT_DROPS.filter((x) => x.creatorId === CREATOR_USER.id)) {
      expect(d.creatorName).toBe(CREATOR_USER.username);
      expect(d.creatorHandle).toBe(CREATOR_USER.handle);
    }
  });
});

describe('seed squads', () => {
  it('ids and tags are unique', () => {
    expectUnique(INITIAL_SQUADS.map((s) => s.id));
    expectUnique(INITIAL_SQUADS.map((s) => s.tag));
  });

  it.each(INITIAL_SQUADS.map((s) => [s.id, s] as const))('%s: fields are sane', (_id, s) => {
    expect(s.memberCount).toBeGreaterThanOrEqual(1);
    expect(s.memberCount).toBeLessThanOrEqual(s.maxMembers);
    expect(s.weeklyGoalProgress).toBeGreaterThanOrEqual(0);
    expect(s.weeklyGoalProgress).toBeLessThanOrEqual(100);
    expect(s.totalAura).toBeGreaterThanOrEqual(0);
    expect(s.rankPosition).toBeGreaterThanOrEqual(1);
  });

  it('rank positions are unique and ordered by total aura', () => {
    expectUnique(INITIAL_SQUADS.map((s) => String(s.rankPosition)));
    const byPosition = [...INITIAL_SQUADS].sort((a, b) => a.rankPosition - b.rankPosition);
    for (let i = 1; i < byPosition.length; i++) {
      expect(byPosition[i].totalAura).toBeLessThanOrEqual(byPosition[i - 1].totalAura);
    }
  });

  it("INITIAL_USER's squad exists and is led by them", () => {
    const squad = INITIAL_SQUADS.find((s) => s.id === INITIAL_USER.squadId);
    expect(squad).toBeDefined();
    expect(squad?.leaderName).toBe(INITIAL_USER.username);
    expect(squad?.streakDays).toBeLessThanOrEqual(INITIAL_USER.streakDays);
  });
});

describe('seed gym leaderboard', () => {
  it('ranks are 1..n and ordered by total aura', () => {
    INITIAL_GYM_LEADERBOARD.forEach((g, i) => {
      expect(g.rank).toBe(i + 1);
      if (i > 0) expect(g.totalAuraEarned).toBeLessThanOrEqual(INITIAL_GYM_LEADERBOARD[i - 1].totalAuraEarned);
    });
  });

  it('gym names are unique and top hunters are handles', () => {
    expectUnique(INITIAL_GYM_LEADERBOARD.map((g) => g.gymName));
    for (const g of INITIAL_GYM_LEADERBOARD) {
      expect(g.topHunter.startsWith('@')).toBe(true);
      expect(g.activeSquads).toBeGreaterThanOrEqual(0);
    }
  });
});
