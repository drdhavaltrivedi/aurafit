import { describe, expect, it } from 'vitest';
import {
  MAX_AURA_PER_SYNC,
  MAX_ID_LENGTH,
  MAX_STAT_GAIN_PER_SYNC,
  validateSyncPayload,
} from '../src/index';

const valid = { userId: 'usr_jinwoo_99', auraGained: 250, questId: 'q_daily_1' };

function errorsOf(input: unknown): string[] {
  const r = validateSyncPayload(input);
  if (r.ok) throw new Error('expected validation failure');
  return r.errors;
}

describe('validateSyncPayload: accepts', () => {
  it('a minimal quest sync', () => {
    expect(validateSyncPayload(valid)).toEqual({ ok: true, value: valid });
  });

  it('a workout sync with stats', () => {
    const input = { userId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', auraGained: 675, workoutId: 'drop_phonk_1', stats: { str: 3, rec: 0 } };
    expect(validateSyncPayload(input)).toEqual({ ok: true, value: input });
  });

  it('a heartbeat with no gains (auraGained defaults to 0)', () => {
    expect(validateSyncPayload({ userId: 'u1' })).toEqual({ ok: true, value: { userId: 'u1', auraGained: 0 } });
  });

  it('boundary values', () => {
    expect(validateSyncPayload({ ...valid, auraGained: 0 }).ok).toBe(true);
    expect(validateSyncPayload({ ...valid, auraGained: MAX_AURA_PER_SYNC }).ok).toBe(true);
    expect(validateSyncPayload({ ...valid, userId: 'a'.repeat(MAX_ID_LENGTH) }).ok).toBe(true);
    expect(validateSyncPayload({ ...valid, stats: { agi: MAX_STAT_GAIN_PER_SYNC } }).ok).toBe(true);
  });

  it('does not copy unrelated prototype data into the result', () => {
    const r = validateSyncPayload(JSON.parse('{"userId":"u1","auraGained":5,"questId":"q"}'));
    expect(r.ok && Object.keys(r.value).sort()).toEqual(['auraGained', 'questId', 'userId']);
  });
});

describe('validateSyncPayload: rejects', () => {
  it.each([null, undefined, 'string', 42, true, [], [valid], new Date()])('non-object body %#', (input) => {
    expect(errorsOf(input)).toEqual(['body must be a JSON object']);
  });

  it('missing or invalid userId', () => {
    expect(errorsOf({ auraGained: 0 })).toContain('userId must be a string');
    expect(errorsOf({ userId: 123 })).toContain('userId must be a string');
    expect(errorsOf({ userId: '' })[0]).toMatch(/userId must be 1-/);
    expect(errorsOf({ userId: 'a'.repeat(MAX_ID_LENGTH + 1) })[0]).toMatch(/userId must be 1-/);
    expect(errorsOf({ userId: 'bad id' })[0]).toMatch(/userId may only contain/);
    expect(errorsOf({ userId: "x'; DROP TABLE profiles;--" })[0]).toMatch(/userId may only contain/);
    expect(errorsOf({ userId: '<script>' })[0]).toMatch(/userId may only contain/);
  });

  it.each([-1, MAX_AURA_PER_SYNC + 1, 1e9, 1.5, NaN, Infinity, '250', null, true])('auraGained = %s', (aura) => {
    expect(errorsOf({ ...valid, auraGained: aura })).toContain(
      `auraGained must be an integer between 0 and ${MAX_AURA_PER_SYNC}`
    );
  });

  it('invalid questId / workoutId', () => {
    expect(errorsOf({ ...valid, questId: 5 })).toContain('questId must be a string');
    expect(errorsOf({ ...valid, workoutId: '../etc/passwd' })[0]).toMatch(/workoutId may only contain/);
    expect(errorsOf({ ...valid, questId: 'q'.repeat(101) })[0]).toMatch(/questId must be 1-/);
  });

  it('gains without a source quest/workout', () => {
    expect(errorsOf({ userId: 'u1', auraGained: 100 })).toContain('aura or stat gains must reference a questId or workoutId');
    expect(errorsOf({ userId: 'u1', stats: { str: 2 } })).toContain('aura or stat gains must reference a questId or workoutId');
  });

  it('invalid stats', () => {
    expect(errorsOf({ ...valid, stats: [] })).toContain('stats must be an object');
    expect(errorsOf({ ...valid, stats: 'str' })).toContain('stats must be an object');
    expect(errorsOf({ ...valid, stats: { cha: 1 } })).toContain('unknown stat: cha');
    expect(errorsOf({ ...valid, stats: { str: -1 } })).toContain(`stats.str must be an integer between 0 and ${MAX_STAT_GAIN_PER_SYNC}`);
    expect(errorsOf({ ...valid, stats: { str: MAX_STAT_GAIN_PER_SYNC + 1 } })[0]).toMatch(/stats.str/);
    expect(errorsOf({ ...valid, stats: { end: 2.5 } })[0]).toMatch(/stats.end/);
  });

  it('unknown top-level fields (e.g. client-asserted status)', () => {
    expect(errorsOf({ ...valid, antiCheatStatus: 'VERIFIED' })).toContain('unknown field: antiCheatStatus');
    expect(errorsOf(JSON.parse('{"userId":"u1","__proto__":{"admin":true}}'))).toContain('unknown field: __proto__');
  });

  it('collects multiple errors at once', () => {
    expect(errorsOf({ userId: 1, auraGained: -1, questId: 2 }).length).toBeGreaterThanOrEqual(3);
  });
});
