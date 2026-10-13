import { describe, expect, it } from 'vitest';
import { INITIAL_QUESTS, INITIAL_USER } from '@aurafit/shared';
import { applyQuestCompletion, applyWorkoutCompletion, markQuestCompleted } from './progress';

describe('optimistic progress helpers', () => {
  it('quest completion adds aura, re-derives rank and clamps the stat at 100', () => {
    const user = { ...INITIAL_USER, auraPoints: 6900, attributes: { ...INITIAL_USER.attributes, str: 99 } };
    const next = applyQuestCompletion(user, 'str', 3, 200);
    expect(next.auraPoints).toBe(7100);
    expect(next.rank).toBe('B-RANK');
    expect(next.attributes.str).toBe(100);
    expect(next.totalWorkouts).toBe(user.totalWorkouts + 1);
    expect(next.weeklyAuraGained).toBe(user.weeklyAuraGained + 200);
    expect(user.attributes.str).toBe(99); // immutable
  });

  it('workout completion bumps str/agi/end', () => {
    const next = applyWorkoutCompletion(INITIAL_USER, 10);
    expect(next.attributes).toEqual({
      str: INITIAL_USER.attributes.str + 4,
      agi: INITIAL_USER.attributes.agi + 4,
      end: INITIAL_USER.attributes.end + 3,
      rec: INITIAL_USER.attributes.rec,
    });
  });

  it('marks only the target quest completed', () => {
    const next = markQuestCompleted(INITIAL_QUESTS, 'q_daily_1');
    expect(next.find((q) => q.id === 'q_daily_1')).toMatchObject({ completed: true, progress: 100, currentCount: 50 });
    expect(next.find((q) => q.id === 'q_daily_2')?.completed).toBe(false);
  });
});
