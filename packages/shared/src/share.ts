/**
 * Shareable rank / progress cards.
 *
 * Pure helpers shared by the web image route (/api/og/rank), the public profile page (/u/[handle])
 * and the share UI on web and mobile. Everything here works on already-public leaderboard fields
 * only (display name, handle, rank, aura, the four stats, streak); never pass private data in.
 */
import { RANK_ORDER, getRankFromAura, type HunterRank, type PlayerAttributes, type UserRole } from './index';

/** The public profile fields a rank card may show. No email, auth id, bio or onboarding answers. */
export interface PublicHunterProfile {
  username: string;
  /** Stored form, e.g. "@kai_levels". */
  handle: string;
  role: UserRole;
  auraPoints: number;
  level: number;
  attributes: PlayerAttributes;
  streakDays: number;
  totalWorkouts: number;
}

/** Same rule as the DB CHECK on profiles.handle, with the leading "@" optional. */
export const SHARE_HANDLE_PATTERN = /^@?[A-Za-z0-9_.]{2,49}$/;

/** Card image formats: 1080x1920 (Stories / TikTok / Reels) or 1080x1080 (feeds / X). */
export type RankCardFormat = 'story' | 'square';

export const RANK_CARD_SIZES: Record<RankCardFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

/**
 * Strictly validates a user-supplied handle ("kai_levels" or "@kai_levels", already URL-decoded;
 * no trimming) and returns its stored form ("@kai_levels"), or null when it is not a valid handle.
 */
export function normalizeShareHandle(raw: unknown): string | null {
  if (typeof raw !== 'string' || !SHARE_HANDLE_PATTERN.test(raw)) return null;
  return raw.startsWith('@') ? raw : `@${raw}`;
}

/** "@kai_levels" → "kai_levels" (the form used in URLs). Expects a normalized handle. */
export function handleSlug(handle: string): string {
  return handle.startsWith('@') ? handle.slice(1) : handle;
}

/** Parses the ?format= query value. Missing → "story"; anything unknown → null. */
export function parseRankCardFormat(raw: string | null | undefined): RankCardFormat | null {
  if (raw === null || raw === undefined || raw === '' || raw === 'story') return 'story';
  if (raw === 'square') return 'square';
  return null;
}

/** Path of the public profile page, e.g. "/u/kai_levels". */
export function publicProfilePath(handle: string): string {
  return `/u/${encodeURIComponent(handleSlug(handle))}`;
}

/** Optional cache-busting version on card URLs (we use the aura total): 1-12 digits. */
export const RANK_CARD_VERSION_PATTERN = /^\d{1,12}$/;

/**
 * Path of the card image, e.g. "/api/og/rank?handle=kai_levels&format=square&v=8450".
 * `version` (the current aura total) changes the URL whenever the card's numbers change, so CDN
 * and link-preview caches never serve an outdated card right after a rank-up.
 */
export function rankCardImagePath(handle: string, format: RankCardFormat = 'story', version?: number): string {
  let path = `/api/og/rank?handle=${encodeURIComponent(handleSlug(handle))}`;
  if (format === 'square') path += '&format=square';
  if (typeof version === 'number' && Number.isFinite(version) && version >= 0) path += `&v=${Math.floor(version)}`;
  return path;
}

/** Joins an origin ("https://example.com" or "https://example.com/") and a path. */
export function absoluteUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}${path}`;
}

/** Download filename, e.g. "aurafit-s-rank.png" / "aurafit-monarch.png". */
export function rankCardFileName(rank: HunterRank): string {
  return `aurafit-${rank.toLowerCase()}.png`;
}

/** Locale-independent thousands separators: 12345 → "12,345". Non-finite / negative → "0". */
export function formatCardNumber(n: number): string {
  const safe = typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  return String(safe).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Human rank label: "S-RANK" → "S-Rank", "MONARCH" → "Monarch". */
export function rankLabel(rank: HunterRank): string {
  return rank === 'MONARCH' ? 'Monarch' : `${rank[0]}-Rank`;
}

/** The big glyph on the card: "S" for S-RANK, the crown word for Monarch. */
export function rankGlyph(rank: HunterRank): string {
  return rank === 'MONARCH' ? 'MONARCH' : rank[0];
}

/** Rank colour themes (matching the rank ladder: silver → slate → cyan → emerald → violet → crimson → gold). */
export const RANK_CARD_THEMES: Record<HunterRank, { from: string; to: string; glow: string }> = {
  'E-RANK': { from: '#CBD5E1', to: '#64748B', glow: 'rgba(203, 213, 225, 0.35)' },
  'D-RANK': { from: '#93C5FD', to: '#475569', glow: 'rgba(147, 197, 253, 0.35)' },
  'C-RANK': { from: '#67E8F9', to: '#0891B2', glow: 'rgba(103, 232, 249, 0.38)' },
  'B-RANK': { from: '#6EE7B7', to: '#059669', glow: 'rgba(110, 231, 183, 0.38)' },
  'A-RANK': { from: '#C4B5FD', to: '#7C3AED', glow: 'rgba(167, 139, 250, 0.45)' },
  'S-RANK': { from: '#FDA4AF', to: '#E11D48', glow: 'rgba(251, 113, 133, 0.42)' },
  MONARCH: { from: '#FDE68A', to: '#A855F7', glow: 'rgba(253, 230, 138, 0.42)' },
};

export interface RankCardStat {
  key: keyof PlayerAttributes;
  label: 'STR' | 'AGI' | 'END' | 'REC';
  name: string;
  value: number;
  /** Bar fill, 0-100. */
  percent: number;
  color: string;
}

export interface RankCardData {
  displayName: string;
  /** Stored form, "@kai_levels". */
  handle: string;
  rank: HunterRank;
  rankLabel: string;
  rankGlyph: string;
  /** 1-based position on the 7-step ladder. */
  rankTier: number;
  nextRank: HunterRank | null;
  nextRankLabel: string | null;
  /** 0-100 (100 only at the top rank). */
  progressPercent: number;
  pointsToNext: number;
  /** "42% to A-Rank" / "Top rank reached". */
  progressLabel: string;
  /** "1,234 aura to A-Rank" / "Top of the ladder". */
  progressDetail: string;
  auraPoints: number;
  auraLabel: string;
  level: number;
  streakDays: number;
  /** "14-day streak" / "1-day streak" / "No streak yet". */
  streakLabel: string;
  totalWorkouts: number;
  stats: RankCardStat[];
  theme: { from: string; to: string; glow: string };
}

const STAT_META: { key: keyof PlayerAttributes; label: RankCardStat['label']; name: string; color: string }[] = [
  { key: 'str', label: 'STR', name: 'Strength', color: '#F87171' },
  { key: 'agi', label: 'AGI', name: 'Agility', color: '#38BDF8' },
  { key: 'end', label: 'END', name: 'Endurance', color: '#34D399' },
  { key: 'rec', label: 'REC', name: 'Recovery', color: '#A78BFA' },
];

export const MAX_CARD_NAME_LENGTH = 28;

const nonNegInt = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** Trims, collapses whitespace, strips control characters and truncates with an ellipsis. */
export function cardDisplayName(name: unknown, fallback = 'Hunter'): string {
  // eslint-disable-next-line no-control-regex
  const clean = typeof name === 'string' ? name.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim() : '';
  if (!clean) return fallback;
  const chars = Array.from(clean);
  return chars.length > MAX_CARD_NAME_LENGTH ? `${chars.slice(0, MAX_CARD_NAME_LENGTH - 1).join('').trimEnd()}…` : clean;
}

/** Turns a public profile into everything a rank card shows. Rank is always derived from aura. */
export function buildRankCardData(profile: PublicHunterProfile): RankCardData {
  const auraPoints = nonNegInt(profile.auraPoints);
  const info = getRankFromAura(auraPoints);
  const streakDays = nonNegInt(profile.streakDays);
  const nextRankLabel = info.nextRank ? rankLabel(info.nextRank) : null;
  const progressPercent = info.nextRank ? info.progressToNext : 100;
  const handle = normalizeShareHandle(profile.handle) ?? profile.handle;

  return {
    displayName: cardDisplayName(profile.username, handleSlug(handle) || 'Hunter'),
    handle,
    rank: info.rank,
    rankLabel: rankLabel(info.rank),
    rankGlyph: rankGlyph(info.rank),
    rankTier: RANK_ORDER.indexOf(info.rank) + 1,
    nextRank: info.nextRank,
    nextRankLabel,
    progressPercent,
    pointsToNext: info.pointsNeeded,
    progressLabel: nextRankLabel ? `${progressPercent}% to ${nextRankLabel}` : 'Top rank reached',
    progressDetail: nextRankLabel ? `${formatCardNumber(info.pointsNeeded)} aura to ${nextRankLabel}` : 'Top of the ladder',
    auraPoints,
    auraLabel: formatCardNumber(auraPoints),
    level: Math.max(1, nonNegInt(profile.level)),
    streakDays,
    streakLabel: streakDays > 0 ? `${formatCardNumber(streakDays)}-day streak` : 'No streak yet',
    totalWorkouts: nonNegInt(profile.totalWorkouts),
    stats: STAT_META.map(({ key, label, name, color }) => {
      const value = nonNegInt(profile.attributes?.[key]);
      return { key, label, name, value, percent: Math.min(100, value), color };
    }),
    theme: RANK_CARD_THEMES[info.rank],
  };
}

/** Text that goes with a shared card (intent links, native share sheet). */
export function rankShareText(card: Pick<RankCardData, 'rankLabel' | 'auraLabel'>, own = true): string {
  return own
    ? `I'm ${card.rankLabel} on AuraFit with ${card.auraLabel} aura. Can you catch me?`
    : `${card.rankLabel} on AuraFit with ${card.auraLabel} aura.`;
}

/** Text for the "you just ranked up" share prompt. */
export function rankUpShareText(rank: HunterRank): string {
  return `I just ranked up to ${rankLabel(rank)} on AuraFit. Level up with me.`;
}

/** Share intent URLs for X, WhatsApp and Telegram. */
export function shareIntentUrls(url: string, text: string): { x: string; whatsapp: string; telegram: string } {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  return {
    x: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    telegram: `https://t.me/share/url?url=${u}&text=${t}`,
  };
}
