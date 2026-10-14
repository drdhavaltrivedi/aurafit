/**
 * Rank card sharing (pure helpers, no React Native imports so they can be unit-tested).
 * The native side lives in `hooks/useShareCard.ts`.
 */
import {
  absoluteUrl,
  buildRankCardData,
  normalizeShareHandle,
  publicProfilePath,
  rankCardFileName,
  rankCardImagePath,
  rankLabel,
  rankShareText,
  rankUpShareText,
  type HunterRank,
  type UserProfile,
} from '@aurafit/shared';

export type ShareCardUser = Pick<UserProfile, 'username' | 'handle' | 'role' | 'auraPoints' | 'level' | 'attributes' | 'streakDays' | 'totalWorkouts'>;

export interface ShareCardPlan {
  /** Story-format PNG (1080x1920), versioned with the current aura so caches never serve a stale card. */
  imageUrl: string;
  /** Public page /u/<handle>, used for the text-only fallback. */
  pageUrl: string;
  fileName: string;
  title: string;
  message: string;
}

export type ShareCardPlanResult = { ok: true; plan: ShareCardPlan } | { ok: false; reason: string };

export const DEMO_SHARE_REASON = "Demo profiles aren't public, so they can't be shared. Create a free account to get your own hunter card.";

/** Everything needed to share a user's card, or why it cannot be shared. */
export function planShareCard(
  user: ShareCardUser | null,
  siteUrl: string | null,
  opts: { demo: boolean; rankUp?: HunterRank } = { demo: false }
): ShareCardPlanResult {
  if (opts.demo || !user) return { ok: false, reason: DEMO_SHARE_REASON };
  if (!siteUrl) return { ok: false, reason: 'Sharing needs a connection to the AuraFit server, which is not configured in this build.' };
  const handle = normalizeShareHandle(user.handle);
  if (!handle) return { ok: false, reason: 'Your profile has no public handle yet.' };
  const card = buildRankCardData({ ...user, handle });
  const pageUrl = absoluteUrl(siteUrl, publicProfilePath(handle));
  const text = opts.rankUp ? rankUpShareText(opts.rankUp) : rankShareText(card);
  return {
    ok: true,
    plan: {
      imageUrl: absoluteUrl(siteUrl, rankCardImagePath(handle, 'story', card.auraPoints)),
      pageUrl,
      fileName: rankCardFileName(card.rank),
      title: opts.rankUp ? `Ranked up to ${rankLabel(opts.rankUp)}` : 'My AuraFit hunter card',
      message: `${text} ${pageUrl}`,
    },
  };
}

/** User-facing message for a failed download/share. */
export function shareErrorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err ?? '');
  if (/404/.test(text)) return "We couldn't find your public card yet. Pull to refresh and try again.";
  if (/network|offline|internet|timed? ?out|UnableToDownload/i.test(text)) return "Couldn't download your card. Check your connection and try again.";
  return "Couldn't share your card right now. Please try again.";
}
