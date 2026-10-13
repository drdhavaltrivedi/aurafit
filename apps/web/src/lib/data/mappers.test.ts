import { describe, expect, it } from 'vitest';
import { INITIAL_WORKOUT_DROPS } from '@aurafit/shared';
import { dropToInsertRow, rowToDrop, rowToSquad } from './mappers';
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

  it('maps squads with a 1-based rank position', () => {
    const squad = rowToSquad(
      { id: 's', name: 'Shadow', tag: '#S', avatar: null, total_aura: '42', member_count: 3, max_members: 5, streak_days: 2, weekly_goal_progress: 50, status: 'ON_FIRE', leader: null },
      0,
    );
    expect(squad).toMatchObject({ rankPosition: 1, totalAura: 42, avatar: '⚔️', leaderName: '—' });
  });
});
