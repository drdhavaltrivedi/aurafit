import { describe, expect, it } from 'vitest';
import { INITIAL_QUESTS, INITIAL_USER, INITIAL_WORKOUT_DROPS } from '@aurafit/shared';
import { markQuestCompleted, optimisticCompleteQuest, optimisticCompleteWorkout } from '../src/api/optimistic';
import type { MeResponse } from '../src/api/types';

const me = (): MeResponse => ({
  profile: { ...INITIAL_USER },
  quests: INITIAL_QUESTS.map((q) => ({ ...q, completed: false })),
});

describe('optimistic updates', () => {
  it('completes a quest and grants aura + stat', () => {
    const base = me();
    const q = base.quests[0];
    const next = optimisticCompleteQuest(base, q.id)!;
    expect(next.quests[0].completed).toBe(true);
    expect(next.profile.auraPoints).toBeGreaterThan(base.profile.auraPoints);
    expect(next.profile.attributes[q.statReward.stat]).toBe(base.profile.attributes[q.statReward.stat] + q.statReward.amount);
    expect(base.quests[0].completed).toBe(false); // input not mutated
  });

  it('is a no-op for completed or unknown quests', () => {
    const base = markQuestCompleted(me(), INITIAL_QUESTS[0].id);
    expect(optimisticCompleteQuest(base, INITIAL_QUESTS[0].id)).toBeNull();
    expect(optimisticCompleteQuest(base, 'nope')).toBeNull();
  });

  it('counts a workout', () => {
    const base = me();
    const next = optimisticCompleteWorkout(base, INITIAL_WORKOUT_DROPS[0]);
    expect(next.profile.totalWorkouts).toBe(base.profile.totalWorkouts + 1);
    expect(next.profile.auraPoints).toBeGreaterThan(base.profile.auraPoints);
  });
});
