import { describe, expect, it } from 'vitest';
import { BIO_MAX, TITLE_MAX, USERNAME_MAX, deriveAchievements, normalizeProfilePatch, validateProfilePatch } from '../src/lib/profile';

describe('profile validation (mirrors DB checks)', () => {
  it('requires a non-blank username within limits', () => {
    expect(validateProfilePatch({ username: '   ', title: '', bio: '' }).username).toBeTruthy();
    expect(validateProfilePatch({ username: 'x'.repeat(USERNAME_MAX + 1), title: '', bio: '' }).username).toBeTruthy();
    expect(validateProfilePatch({ username: 'Neo', title: '', bio: '' })).toEqual({});
  });

  it('limits title and bio length', () => {
    const e = validateProfilePatch({ username: 'Neo', title: 't'.repeat(TITLE_MAX + 1), bio: 'b'.repeat(BIO_MAX + 1) });
    expect(e.title).toBeTruthy();
    expect(e.bio).toBeTruthy();
  });

  it('trims values', () => {
    expect(normalizeProfilePatch({ username: ' Neo ', title: ' Runner ', bio: ' hi ' })).toEqual({ username: 'Neo', title: 'Runner', bio: 'hi' });
  });
});

describe('achievements', () => {
  it('derives unlocks only from real profile values', () => {
    const fresh = deriveAchievements({ auraPoints: 0, streakDays: 0, totalWorkouts: 0 });
    expect(fresh.every((a) => !a.unlocked)).toBe(true);
    const some = deriveAchievements({ auraPoints: 1500, streakDays: 7, totalWorkouts: 1 });
    const unlocked = some.filter((a) => a.unlocked).map((a) => a.id);
    expect(unlocked).toEqual(['rank-D-RANK', 'streak-3', 'streak-7', 'sessions-1']);
  });
});
