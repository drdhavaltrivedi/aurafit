import { describe, expect, it } from 'vitest';
import { createInitialState, gameReducer } from '../src/lib/gameState';

describe('game state reset', () => {
  it('wipes progress back to seed data but keeps the theme preference', () => {
    const today = '2026-10-13';
    let state = createInitialState(today);
    state = gameReducer(state, { type: 'SET_THEME', preference: 'light' });
    state = gameReducer(state, { type: 'SET_ROLE', role: 'ADMIN' });
    const questId = state.quests[0].id;
    state = gameReducer(gameReducer(state, { type: 'SET_ROLE', role: 'MEMBER' }), {
      type: 'COMPLETE_QUEST',
      questId,
      today,
    });
    expect(state.quests[0].completed).toBe(true);

    const reset = gameReducer(state, { type: 'RESET', today });
    expect(reset).toEqual({ ...createInitialState(today), themePreference: 'light' });
  });
});
