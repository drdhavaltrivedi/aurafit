import { describe, expect, it } from 'vitest';
import { INITIAL_WORKOUT_DROPS } from '@aurafit/shared';
import { dropToInsertRow, rowToDrop } from './mappers';
import type { DropRow } from './types';

describe('row mappers', () => {
  it('round-trips a WorkoutDrop through insert row + embedded creator', () => {
    const drop = INITIAL_WORKOUT_DROPS[0];
    const row: DropRow = {
      ...dropToInsertRow(drop),
      aura_multiplier: String(drop.auraMultiplier), // NUMERIC arrives as a string
      likes_count: drop.likesCount,
      completions_count: drop.completionsCount,
      creator: { username: drop.creatorName, handle: drop.creatorHandle, avatar_url: drop.creatorAvatar },
    };
    expect(rowToDrop(row)).toEqual(drop);
  });

  it('drops malformed exercises and tolerates a missing creator', () => {
    const row = {
      ...dropToInsertRow(INITIAL_WORKOUT_DROPS[1]),
      exercises: [{ id: 'ok', name: 'Ok' }, null, 'x', { name: 'no id' }],
      likes_count: 0,
      completions_count: 0,
      creator: null,
    } as DropRow;
    const drop = rowToDrop(row);
    expect(drop.exercises).toEqual([{ id: 'ok', name: 'Ok', targetMuscle: '', repsOrSeconds: '', tips: '' }]);
    expect(drop.creatorName).toBe('Unknown creator');
  });
});
