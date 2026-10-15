import { describe, expect, it } from 'vitest';
import {
  COVER_GRADIENTS,
  CREATOR_DROP_LIMITS,
  INITIAL_WORKOUT_DROPS,
  MAX_AURA_PER_ACTION,
  asCreatorDrop,
  buildCreatorDrop,
  calculateAuraGain,
  creatorProfilePath,
  dropStatus,
  dropToEditorInput,
  findCoverGradient,
  isSystemDropId,
  moveItem,
  parseAnalyticsRange,
  publishAtError,
  sampleCreatorAnalytics,
  toExercises,
  validateDropEditorInput,
  xpForDrop,
  type DropEditorInput,
} from '../src/index';

const NOW = new Date('2026-10-14T12:00:00Z');

const valid = (over: Partial<DropEditorInput> = {}): DropEditorInput => ({
  title: '  Core   Reset ',
  tagline: 'Ten minutes of controlled core work',
  vibeTag: ' lo-fi  glow ',
  category: 'STRENGTH',
  difficulty: 'HUNTER',
  durationMinutes: 12,
  caloriesBurnEstimate: 90,
  auraMultiplier: 1.55,
  coverGradient: ['#7c3aed', '#3b82f6'],
  exercises: [{ name: 'Dead Bugs', targetMuscle: 'Deep Core', repsOrSeconds: '3 x 10', tips: 'Slow.' }],
  publishAt: null,
  ...over,
});

describe('validateDropEditorInput', () => {
  it('normalises a valid body', () => {
    const r = validateDropEditorInput(valid(), { now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      title: 'Core Reset',
      vibeTag: 'LO-FI GLOW',
      auraMultiplier: 1.6,
      coverGradient: ['#7C3AED', '#3B82F6'],
      publishAt: null,
    });
  });

  it('reports every invalid field with stable keys', () => {
    const r = validateDropEditorInput(
      {
        title: 'ab',
        tagline: 'x'.repeat(121),
        vibeTag: '🔥🔥',
        category: 'YOGA',
        difficulty: 'EASY',
        durationMinutes: 61,
        caloriesBurnEstimate: 2001,
        auraMultiplier: 3.1,
        coverGradient: ['#000000', '#FFFFFF'],
        exercises: [{ name: '', targetMuscle: 'x', repsOrSeconds: '', tips: 'y'.repeat(281) }, 'nope'],
        publishAt: '2026-10-14T11:00:00Z',
      },
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.fieldErrors).sort()).toEqual(
      [
        'title',
        'tagline',
        'vibeTag',
        'category',
        'difficulty',
        'durationMinutes',
        'caloriesBurnEstimate',
        'auraMultiplier',
        'coverGradient',
        'exercises.0.name',
        'exercises.0.targetMuscle',
        'exercises.0.repsOrSeconds',
        'exercises.0.tips',
        'exercises.1',
        'publishAt',
      ].sort(),
    );
  });

  it('enforces 1-30 exercises and numeric types', () => {
    const none = validateDropEditorInput(valid({ exercises: [] }), { now: NOW });
    expect(!none.ok && none.fieldErrors.exercises).toMatch(/at least one/);
    const many = validateDropEditorInput(valid({ exercises: Array.from({ length: 31 }, () => valid().exercises[0]) }), { now: NOW });
    expect(!many.ok && many.fieldErrors.exercises).toMatch(/at most 30/);
    const thirty = validateDropEditorInput(valid({ exercises: Array.from({ length: 30 }, () => valid().exercises[0]) }), { now: NOW });
    expect(thirty.ok).toBe(true);
    const str = validateDropEditorInput({ ...valid(), durationMinutes: '12' }, { now: NOW });
    expect(!str.ok && str.fieldErrors.durationMinutes).toBeTruthy();
    for (const d of [CREATOR_DROP_LIMITS.durationMin, CREATOR_DROP_LIMITS.durationMax]) {
      expect(validateDropEditorInput(valid({ durationMinutes: d }), { now: NOW }).ok).toBe(true);
    }
    expect(validateDropEditorInput(valid({ durationMinutes: 2 }), { now: NOW }).ok).toBe(false);
    expect(validateDropEditorInput(valid({ auraMultiplier: 1 }), { now: NOW }).ok).toBe(true);
    expect(validateDropEditorInput(valid({ auraMultiplier: 3 }), { now: NOW }).ok).toBe(true);
    expect(validateDropEditorInput(valid({ caloriesBurnEstimate: 0 }), { now: NOW }).ok).toBe(true);
  });

  it('publishAt: future within 60 days; null = live now; omitted = unchanged only for PATCH', () => {
    const ok = validateDropEditorInput(valid({ publishAt: '2026-10-20T09:00:00+02:00' }), { now: NOW });
    expect(ok.ok && ok.value.publishAt).toBe('2026-10-20T07:00:00.000Z');
    expect(validateDropEditorInput(valid({ publishAt: '2026-12-14T12:00:01Z' }), { now: NOW }).ok).toBe(false);
    expect(validateDropEditorInput(valid({ publishAt: 'tomorrow' }), { now: NOW }).ok).toBe(false);
    const { publishAt: _omit, ...rest } = valid();
    const create = validateDropEditorInput(rest, { now: NOW });
    expect(create.ok && create.value.publishAt).toBeNull();
    const patch = validateDropEditorInput(rest, { now: NOW, patch: true });
    expect(patch.ok && patch.value.publishAt).toBeUndefined();
    expect(publishAtError(undefined)).toBeNull();
    expect(publishAtError(42)).toMatch(/valid/);
  });

  it('rejects non-objects', () => {
    expect(validateDropEditorInput(null).ok).toBe(false);
    expect(validateDropEditorInput([]).ok).toBe(false);
  });
});

describe('helpers', () => {
  it('cover gradients are 8 valid hex pairs and lookup is case-insensitive', () => {
    expect(COVER_GRADIENTS).toHaveLength(8);
    for (const g of COVER_GRADIENTS) {
      expect(g.from).toMatch(/^#[0-9A-F]{6}$/);
      expect(g.to).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(findCoverGradient(['#06b6d4', '#3B82F6'])?.id).toBe('cyan-blue');
    expect(findCoverGradient(['#06b6d4'])).toBeNull();
  });

  it('xpForDrop is bounded so a completion never exceeds MAX_AURA_PER_ACTION', () => {
    expect(xpForDrop(10, 'NOVICE')).toBe(150);
    const max = xpForDrop(60, 'SHADOW');
    expect(calculateAuraGain(max, 100, 3)).toBeLessThanOrEqual(MAX_AURA_PER_ACTION);
  });

  it('status, system drops, ranges, paths, ids and reordering', () => {
    expect(dropStatus(null, NOW)).toBe('LIVE');
    expect(dropStatus('2026-10-14T11:59:59Z', NOW)).toBe('LIVE');
    expect(dropStatus('2026-10-15T00:00:00Z', NOW)).toBe('SCHEDULED');
    expect(isSystemDropId('af_core_armor_10')).toBe(true);
    expect(isSystemDropId('drop_x')).toBe(false);
    expect(parseAnalyticsRange(null)).toBe('7d');
    expect(parseAnalyticsRange('30d')).toBe('30d');
    expect(parseAnalyticsRange('1y')).toBeNull();
    expect(creatorProfilePath('@aurafit')).toBe('/c/aurafit');
    expect(toExercises('drop_a', valid().exercises)[0].id).toBe('drop_a_ex1');
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
  });

  it('round-trips a drop through the editor and keeps counters on rebuild', () => {
    const seed = asCreatorDrop(INITIAL_WORKOUT_DROPS[0]);
    const input = dropToEditorInput(seed);
    const r = validateDropEditorInput(input, { now: NOW, patch: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rebuilt = buildCreatorDrop(r.value, { id: seed.creatorId, username: 'A', handle: '@a', avatarUrl: '' }, seed.id, seed, NOW);
    expect(rebuilt.likesCount).toBe(seed.likesCount);
    expect(rebuilt.completionsCount).toBe(seed.completionsCount);
    expect(rebuilt.status).toBe('LIVE');
    expect(rebuilt.exercises).toHaveLength(seed.exercises.length);
  });

  it('sample analytics are internally consistent', () => {
    const drops = INITIAL_WORKOUT_DROPS.map((d) => asCreatorDrop(d));
    const a = sampleCreatorAnalytics(drops, '30d', NOW);
    expect(a.series).toHaveLength(30);
    expect(a.to).toBe('2026-10-14');
    const sum = a.series.reduce((s, p) => s + p.completions, 0);
    expect(a.totals.completions).toBe(sum);
    expect(a.drops.reduce((s, d) => s + d.completions, 0)).toBe(sum);
    expect(sampleCreatorAnalytics([], '7d', NOW).totals.completions).toBe(0);
  });
});
