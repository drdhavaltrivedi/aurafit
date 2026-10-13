import { describe, expect, it } from 'vitest';
import { buildWorkoutDrop, DROP_LIMITS, validateDropDraft, validateDropInput } from '../src/index';

const good = { title: '  Core   Reset  ', vibe: 'LO-FI GLOW', category: 'HIIT', duration: '15', multiplier: '1.55' };

describe('validateDropDraft', () => {
  it('normalises a valid draft', () => {
    expect(validateDropDraft(good)).toEqual({
      ok: true,
      value: { title: 'Core Reset', vibe: 'LO-FI GLOW', category: 'HIIT', duration: 15, multiplier: 1.6 },
    });
  });

  it('reports every invalid field', () => {
    const r = validateDropDraft({ title: 'x', vibe: 'JAZZ', category: 'NAP', duration: '2.5', multiplier: '9' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['category', 'duration', 'multiplier', 'title', 'vibe']);
  });

  it('enforces title length bounds', () => {
    const r = validateDropDraft({ ...good, title: 'x'.repeat(DROP_LIMITS.titleMax + 1) });
    expect(r.ok).toBe(false);
  });
});

describe('validateDropInput (API body)', () => {
  const body = { title: 'Core Reset', vibe: 'HARDSTYLE', category: 'STRENGTH', duration: 20, multiplier: 2 };

  it('accepts a JSON body with numeric fields', () => {
    expect(validateDropInput(body)).toEqual({ ok: true, value: body });
  });

  it('rejects numbers sent as strings, unknown keys and non-objects', () => {
    expect(validateDropInput({ ...body, duration: '20' }).ok).toBe(false);
    expect(validateDropInput({ ...body, xpPoints: 99999 }).ok).toBe(false);
    expect(validateDropInput([body]).ok).toBe(false);
    expect(validateDropInput(null).ok).toBe(false);
    expect(validateDropInput({ ...body, multiplier: Number.POSITIVE_INFINITY }).ok).toBe(false);
  });
});

describe('buildWorkoutDrop', () => {
  it('derives server-controlled fields from the definition', () => {
    const drop = buildWorkoutDrop(
      { title: 'Core Reset', vibe: 'HARDSTYLE', category: 'STRENGTH', duration: 20, multiplier: 2 },
      { id: 'p1', username: 'Alex', handle: '@alex', avatarUrl: '' },
      'drop_test_1',
    );
    expect(drop).toMatchObject({
      id: 'drop_test_1',
      creatorId: 'p1',
      xpPoints: 500,
      caloriesBurnEstimate: 220,
      auraMultiplier: 2,
      likesCount: 0,
      completionsCount: 0,
    });
    expect(drop.exercises.map((e) => e.id)).toEqual(['drop_test_1_ex1', 'drop_test_1_ex2']);
  });
});
