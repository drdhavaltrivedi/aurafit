import { describe, expect, it } from 'vitest';
import { INITIAL_QUESTS } from '@aurafit/shared';
import { isQuestArray } from './validators';

describe('isQuestArray', () => {
  it('accepts saved quests with legacy emoji icons and normalises them to icon keys', () => {
    const saved: unknown = JSON.parse(
      JSON.stringify([
        { ...INITIAL_QUESTS[0], icon: '\u{1F525}' },
        { ...INITIAL_QUESTS[1], icon: 'not-an-icon' },
        { ...INITIAL_QUESTS[2], icon: undefined },
      ]),
    );
    expect(isQuestArray(saved)).toBe(true);
    expect((saved as { icon: string }[]).map((q) => q.icon)).toEqual(['flame', 'zap', 'zap']);
  });

  it('still rejects structurally invalid quests', () => {
    expect(isQuestArray([{ id: 'x' }])).toBe(false);
  });
});
