import { describe, expect, it } from 'vitest';
import {
  ADMIN_ROUTES,
  AURA_FLAG_DEFAULTS,
  auraFlagKinds,
  describeAuraFlags,
  hiddenByModeratorLabel,
  MODERATION_BADGE_MAX_LENGTH,
  MODERATION_NOTE_MAX_LENGTH,
  normalizeUserSearch,
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  suspensionMessage,
  validateAuraFlagThresholds,
  validateClearFlag,
  validateCreateReport,
  validateCreatorBadge,
  validateDismissReports,
  validateHideDrop,
  validateRevertLog,
  validateSetRole,
  validateSuspendUser,
  type AuraFlagMetrics,
} from '../src/index';

const SQUAD_ID = '6f1c2a34-1b2c-4d5e-8f90-123456789abc';
const LOG_ID = '0e1d2c3b-4a59-4876-9543-210fedcba987';

const metrics = (over: Partial<AuraFlagMetrics> = {}): AuraFlagMetrics => ({
  completions: 3,
  maxPerHour: 1,
  burstWindowStart: null,
  todayAura: 500,
  typicalDailyAura: 600,
  baselineDays: 5,
  fastCount: 0,
  ...over,
});

describe('aura flag thresholds', () => {
  it('defaults are sane and pass their own validator', () => {
    expect(validateAuraFlagThresholds({ ...AURA_FLAG_DEFAULTS })).toEqual({ ok: true, value: AURA_FLAG_DEFAULTS });
    expect(Object.isFrozen(AURA_FLAG_DEFAULTS)).toBe(true);
  });

  it('a normal day raises nothing', () => {
    expect(auraFlagKinds(metrics())).toEqual([]);
    expect(describeAuraFlags(metrics())).toEqual([]);
  });

  it('BURST is strictly more than burstPerHour completions in an hour', () => {
    expect(auraFlagKinds(metrics({ maxPerHour: AURA_FLAG_DEFAULTS.burstPerHour }))).toEqual([]);
    expect(auraFlagKinds(metrics({ maxPerHour: AURA_FLAG_DEFAULTS.burstPerHour + 1 }))).toEqual(['BURST']);
  });

  it('DAY_SPIKE needs the absolute minimum and, with a baseline, the multiplier', () => {
    const min = AURA_FLAG_DEFAULTS.dayAuraMin;
    // Above the multiplier but below the absolute floor: not a spike.
    expect(auraFlagKinds(metrics({ todayAura: min - 1, typicalDailyAura: 100 }))).toEqual([]);
    // Above the floor but a normal day for a heavy user.
    expect(auraFlagKinds(metrics({ todayAura: min, typicalDailyAura: min }))).toEqual([]);
    // Exactly multiplier x typical.
    expect(auraFlagKinds(metrics({ todayAura: 4 * 1500, typicalDailyAura: 1500 }))).toEqual(['DAY_SPIKE']);
    // No baseline (null, or too few active days): the floor alone decides.
    expect(auraFlagKinds(metrics({ todayAura: min, typicalDailyAura: null, baselineDays: 0 }))).toEqual(['DAY_SPIKE']);
    expect(auraFlagKinds(metrics({ todayAura: min, typicalDailyAura: min, baselineDays: 2 }))).toEqual(['DAY_SPIKE']);
  });

  it('TOO_FAST at fastMinCount workouts; descriptions explain every flag', () => {
    const m = metrics({ fastCount: 3, maxPerHour: 9, todayAura: 9000, typicalDailyAura: 1000 });
    expect(auraFlagKinds(m)).toEqual(['BURST', 'DAY_SPIKE', 'TOO_FAST']);
    const text = describeAuraFlags(m);
    expect(text).toHaveLength(3);
    expect(text[0]).toContain('9 completions within one hour');
    expect(text[1]).toContain('9x a typical day');
    expect(text[2]).toContain('3 workouts finished faster than 50%');
  });

  it('custom thresholds are honoured and validated', () => {
    const strict = { ...AURA_FLAG_DEFAULTS, burstPerHour: 2, fastMinCount: 1 };
    expect(auraFlagKinds(metrics({ maxPerHour: 3, fastCount: 1 }), strict)).toEqual(['BURST', 'TOO_FAST']);
    const bad = validateAuraFlagThresholds({ ...AURA_FLAG_DEFAULTS, burstPerHour: 0, fastRatio: 2, lookbackDays: 1.5 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.fieldErrors).sort()).toEqual(['burstPerHour', 'fastRatio', 'lookbackDays']);
    expect(validateAuraFlagThresholds(null).ok).toBe(false);
  });
});

describe('report validation', () => {
  it('accepts a drop or squad report with an optional normalised note', () => {
    expect(validateCreateReport({ targetType: 'DROP', targetId: 'af_first_quest_fullbody', reason: 'UNSAFE_EXERCISE', note: '  bad   form  ' })).toEqual({
      ok: true,
      value: { targetType: 'DROP', targetId: 'af_first_quest_fullbody', reason: 'UNSAFE_EXERCISE', note: 'bad form' },
    });
    expect(validateCreateReport({ targetType: 'SQUAD', targetId: SQUAD_ID, reason: 'SPAM', note: '   ' })).toEqual({
      ok: true,
      value: { targetType: 'SQUAD', targetId: SQUAD_ID, reason: 'SPAM' },
    });
  });

  it('rejects unknown types, bad ids, reasons and long notes', () => {
    const r = validateCreateReport({ targetType: 'USER', targetId: 'x', reason: 'MEAN' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(['reason', 'targetType']);
    expect(validateCreateReport({ targetType: 'SQUAD', targetId: 'not-a-uuid', reason: 'SPAM' }).ok).toBe(false);
    expect(validateCreateReport({ targetType: 'DROP', targetId: 'has space', reason: 'SPAM' }).ok).toBe(false);
    expect(validateCreateReport({ targetType: 'DROP', targetId: 'ok', reason: 'SPAM', note: 'x'.repeat(MODERATION_NOTE_MAX_LENGTH + 1) }).ok).toBe(false);
    expect(validateCreateReport({ targetType: 'DROP', targetId: 'ok', reason: 'SPAM', note: 5 }).ok).toBe(false);
    expect(validateCreateReport([]).ok).toBe(false);
  });

  it('every reason has a label', () => {
    for (const r of REPORT_REASONS) expect(REPORT_REASON_LABELS[r]).toBeTruthy();
  });
});

describe('admin request validation', () => {
  it('hide / suspend need a 1-500 char reason', () => {
    expect(validateHideDrop({ reason: '  Spam  links ' })).toEqual({ ok: true, value: { reason: 'Spam links' } });
    expect(validateHideDrop({ reason: ' ' }).ok).toBe(false);
    expect(validateSuspendUser({ reason: 'x'.repeat(501) }).ok).toBe(false);
    expect(validateSuspendUser({ reason: 'Botting' })).toEqual({ ok: true, value: { reason: 'Botting' } });
  });

  it('role must be one of the three roles', () => {
    expect(validateSetRole({ role: 'CREATOR' })).toEqual({ ok: true, value: { role: 'CREATOR' } });
    expect(validateSetRole({ role: 'OWNER' }).ok).toBe(false);
    expect(validateSetRole({ role: '__proto__' }).ok).toBe(false);
  });

  it('creator badge: text up to 50 chars, or null / blank to reset', () => {
    expect(validateCreatorBadge({ badge: ' Certified   Coach ' })).toEqual({ ok: true, value: { badge: 'Certified Coach' } });
    expect(validateCreatorBadge({ badge: null })).toEqual({ ok: true, value: { badge: null } });
    expect(validateCreatorBadge({ badge: '  ' })).toEqual({ ok: true, value: { badge: null } });
    expect(validateCreatorBadge({ badge: 'x'.repeat(MODERATION_BADGE_MAX_LENGTH + 1) }).ok).toBe(false);
    expect(validateCreatorBadge({}).ok).toBe(false);
  });

  it('revert / dismiss / clear-flag bodies', () => {
    expect(validateRevertLog({ kind: 'WORKOUT', logId: LOG_ID })).toEqual({ ok: true, value: { kind: 'WORKOUT', logId: LOG_ID } });
    expect(validateRevertLog({ kind: 'DROP', logId: 'nope' }).ok).toBe(false);
    expect(validateDismissReports({ targetType: 'SQUAD', targetId: SQUAD_ID, note: 'fine' })).toEqual({
      ok: true,
      value: { targetType: 'SQUAD', targetId: SQUAD_ID, note: 'fine' },
    });
    expect(validateClearFlag(undefined)).toEqual({ ok: true, value: {} });
    expect(validateClearFlag({ note: 'reviewed' })).toEqual({ ok: true, value: { note: 'reviewed' } });
  });

  it('helpers', () => {
    expect(hiddenByModeratorLabel('Spam')).toBe('Hidden by moderator: Spam');
    expect(suspensionMessage('Botting')).toContain('suspended: Botting');
    expect(suspensionMessage(null)).toMatch(/^Your account is suspended\. /);
    expect(normalizeUserSearch(`  ${'a'.repeat(80)}  `)).toHaveLength(50);
    expect(ADMIN_ROUTES.hideDrop('a b')).toBe('/api/v1/admin/drops/a%20b/hide');
  });
});
