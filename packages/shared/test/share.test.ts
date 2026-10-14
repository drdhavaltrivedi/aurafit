import { describe, expect, it } from 'vitest';
import {
  RANK_CARD_SIZES,
  absoluteUrl,
  buildRankCardData,
  cardDisplayName,
  formatCardNumber,
  handleSlug,
  normalizeShareHandle,
  parseRankCardFormat,
  publicProfilePath,
  rankCardFileName,
  rankCardImagePath,
  rankGlyph,
  rankLabel,
  rankShareText,
  rankUpShareText,
  shareIntentUrls,
  type PublicHunterProfile,
} from '../src/index';

const base: PublicHunterProfile = {
  username: 'Kai Rivers',
  handle: '@kai_levels',
  role: 'MEMBER',
  auraPoints: 8450,
  level: 24,
  attributes: { str: 68, agi: 74, end: 62, rec: 55 },
  streakDays: 14,
  totalWorkouts: 48,
};

describe('normalizeShareHandle', () => {
  it('accepts handles with or without @ and returns the stored form', () => {
    expect(normalizeShareHandle('kai_levels')).toBe('@kai_levels');
    expect(normalizeShareHandle('@kai_levels')).toBe('@kai_levels');
    expect(normalizeShareHandle('@a.b_9')).toBe('@a.b_9');
    expect(normalizeShareHandle('ab')).toBe('@ab');
    expect(normalizeShareHandle('a'.repeat(49))).toBe(`@${'a'.repeat(49)}`);
  });

  it('rejects anything outside ^@?[A-Za-z0-9_.]{2,49}$', () => {
    for (const bad of ['', 'a', '@a', '@@ab', 'a b', 'a-b', 'ab/..', 'a'.repeat(50), '<script>', 'ab%00', 'ünï', 'ab\n', ' ab', null, undefined, 42]) {
      expect(normalizeShareHandle(bad as unknown)).toBeNull();
    }
  });
});

describe('URL helpers', () => {
  it('builds profile, image and absolute URLs', () => {
    expect(handleSlug('@kai_levels')).toBe('kai_levels');
    expect(publicProfilePath('@kai_levels')).toBe('/u/kai_levels');
    expect(rankCardImagePath('@kai_levels')).toBe('/api/og/rank?handle=kai_levels');
    expect(rankCardImagePath('@kai_levels', 'square')).toBe('/api/og/rank?handle=kai_levels&format=square');
    expect(rankCardImagePath('@kai_levels', 'story', 8450.7)).toBe('/api/og/rank?handle=kai_levels&v=8450');
    expect(rankCardImagePath('@kai_levels', 'square', Number.NaN)).toBe('/api/og/rank?handle=kai_levels&format=square');
    expect(absoluteUrl('https://x.app/', '/u/a')).toBe('https://x.app/u/a');
    expect(absoluteUrl('https://x.app', '/u/a')).toBe('https://x.app/u/a');
  });

  it('parses the format query', () => {
    expect(parseRankCardFormat(null)).toBe('story');
    expect(parseRankCardFormat('')).toBe('story');
    expect(parseRankCardFormat('story')).toBe('story');
    expect(parseRankCardFormat('square')).toBe('square');
    expect(parseRankCardFormat('SQUARE')).toBeNull();
    expect(parseRankCardFormat('banner')).toBeNull();
    expect(RANK_CARD_SIZES.story).toEqual({ width: 1080, height: 1920 });
    expect(RANK_CARD_SIZES.square).toEqual({ width: 1080, height: 1080 });
  });

  it('names downloads after the rank', () => {
    expect(rankCardFileName('S-RANK')).toBe('aurafit-s-rank.png');
    expect(rankCardFileName('MONARCH')).toBe('aurafit-monarch.png');
  });

  it('encodes share intents', () => {
    const urls = shareIntentUrls('https://x.app/u/a', 'Hi & bye');
    expect(urls.x).toBe('https://twitter.com/intent/tweet?text=Hi%20%26%20bye&url=https%3A%2F%2Fx.app%2Fu%2Fa');
    expect(urls.whatsapp).toBe('https://wa.me/?text=Hi%20%26%20bye%20https%3A%2F%2Fx.app%2Fu%2Fa');
    expect(urls.telegram).toBe('https://t.me/share/url?url=https%3A%2F%2Fx.app%2Fu%2Fa&text=Hi%20%26%20bye');
  });
});

describe('formatting', () => {
  it('formats numbers without depending on the runtime locale', () => {
    expect(formatCardNumber(0)).toBe('0');
    expect(formatCardNumber(999)).toBe('999');
    expect(formatCardNumber(1000)).toBe('1,000');
    expect(formatCardNumber(1234567.9)).toBe('1,234,567');
    expect(formatCardNumber(-5)).toBe('0');
    expect(formatCardNumber(Number.NaN)).toBe('0');
    expect(formatCardNumber(Number.POSITIVE_INFINITY)).toBe('0');
  });

  it('labels ranks', () => {
    expect(rankLabel('E-RANK')).toBe('E-Rank');
    expect(rankLabel('S-RANK')).toBe('S-Rank');
    expect(rankLabel('MONARCH')).toBe('Monarch');
    expect(rankGlyph('B-RANK')).toBe('B');
    expect(rankGlyph('MONARCH')).toBe('MONARCH');
  });

  it('cleans and truncates display names', () => {
    expect(cardDisplayName('  Kai   Rivers ')).toBe('Kai Rivers');
    expect(cardDisplayName('')).toBe('Hunter');
    expect(cardDisplayName('\u0000\u0007')).toBe('Hunter');
    expect(cardDisplayName(null, 'kai')).toBe('kai');
    const long = cardDisplayName('A'.repeat(60));
    expect(Array.from(long)).toHaveLength(28);
    expect(long.endsWith('…')).toBe(true);
  });

  it('builds share text', () => {
    expect(rankShareText({ rankLabel: 'B-Rank', auraLabel: '8,450' })).toContain('B-Rank on AuraFit with 8,450 aura');
    expect(rankUpShareText('A-RANK')).toBe('I just ranked up to A-Rank on AuraFit. Level up with me.');
  });
});

describe('buildRankCardData', () => {
  it('derives rank, progress, stats and labels from a public profile', () => {
    const card = buildRankCardData(base);
    expect(card.displayName).toBe('Kai Rivers');
    expect(card.handle).toBe('@kai_levels');
    expect(card.rank).toBe('B-RANK');
    expect(card.rankLabel).toBe('B-Rank');
    expect(card.rankGlyph).toBe('B');
    expect(card.rankTier).toBe(4);
    expect(card.nextRank).toBe('A-RANK');
    // 8450 in [7000, 15000): 1450 / 8000 = 18.1% → 18.
    expect(card.progressPercent).toBe(18);
    expect(card.pointsToNext).toBe(6550);
    expect(card.progressLabel).toBe('18% to A-Rank');
    expect(card.progressDetail).toBe('6,550 aura to A-Rank');
    expect(card.auraLabel).toBe('8,450');
    expect(card.streakLabel).toBe('14-day streak');
    expect(card.level).toBe(24);
    expect(card.stats.map((s) => [s.label, s.value, s.percent])).toEqual([
      ['STR', 68, 68],
      ['AGI', 74, 74],
      ['END', 62, 62],
      ['REC', 55, 55],
    ]);
    expect(card.theme.to).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('ignores a stale stored rank and always derives it from aura', () => {
    expect(buildRankCardData({ ...base, auraPoints: 30000 }).rank).toBe('S-RANK');
    expect(buildRankCardData({ ...base, auraPoints: 0 }).rank).toBe('E-RANK');
  });

  it('handles the top rank', () => {
    const card = buildRankCardData({ ...base, auraPoints: 75000 });
    expect(card.rank).toBe('MONARCH');
    expect(card.nextRank).toBeNull();
    expect(card.nextRankLabel).toBeNull();
    expect(card.progressPercent).toBe(100);
    expect(card.pointsToNext).toBe(0);
    expect(card.progressLabel).toBe('Top rank reached');
    expect(card.progressDetail).toBe('Top of the ladder');
  });

  it('sanitises bad numbers and clamps stat bars', () => {
    const card = buildRankCardData({
      ...base,
      auraPoints: Number.NaN,
      level: 0,
      streakDays: -3,
      totalWorkouts: Number.POSITIVE_INFINITY,
      attributes: { str: 250, agi: -1, end: Number.NaN, rec: 12.7 },
    });
    expect(card.auraPoints).toBe(0);
    expect(card.auraLabel).toBe('0');
    expect(card.level).toBe(1);
    expect(card.streakDays).toBe(0);
    expect(card.streakLabel).toBe('No streak yet');
    expect(card.totalWorkouts).toBe(0);
    expect(card.stats.map((s) => [s.value, s.percent])).toEqual([
      [250, 100],
      [0, 0],
      [0, 0],
      [12, 12],
    ]);
  });

  it('falls back to the handle when the display name is blank and normalises the handle', () => {
    const card = buildRankCardData({ ...base, username: '   ', handle: 'kai_levels' });
    expect(card.displayName).toBe('kai_levels');
    expect(card.handle).toBe('@kai_levels');
    expect(buildRankCardData({ ...base, streakDays: 1 }).streakLabel).toBe('1-day streak');
  });

  it('only exposes public card fields', () => {
    const card = buildRankCardData({ ...base, ...({ email: 'x@y.z', auth_id: 'secret' } as object) });
    expect(JSON.stringify(card)).not.toContain('x@y.z');
    expect(JSON.stringify(card)).not.toContain('secret');
  });
});
