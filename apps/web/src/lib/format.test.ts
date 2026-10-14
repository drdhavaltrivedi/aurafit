import { describe, expect, it } from 'vitest';
import { plural } from './format';

describe('plural', () => {
  it('uses the singular only for exactly one', () => {
    expect(plural(1, 'finish', 'finishes')).toBe('1 finish');
    expect(plural(0, 'finish', 'finishes')).toBe('0 finishes');
    expect(plural(2, 'published drop')).toBe('2 published drops');
    expect(plural(1200, 'like')).toBe('1,200 likes');
  });
});
