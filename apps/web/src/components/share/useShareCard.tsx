'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  absoluteUrl,
  buildRankCardData,
  normalizeShareHandle,
  publicProfilePath,
  rankLabel,
  rankShareText,
  rankUpShareText,
  type HunterRank,
  type UserProfile,
} from '@aurafit/shared';
import { ShareCardDialog } from './ShareCardDialog';

export type ShareReason = 'profile' | 'rankUp';

export interface ShareCardController {
  /** False when the profile has no valid public handle (e.g. still loading). */
  available: boolean;
  /**
   * Shares /u/<handle>: the native share sheet (Web Share API) when the browser has one,
   * otherwise the share dialog (preview, PNG download, copy link, intent links).
   * Call from a user gesture (click), which the Web Share API requires.
   */
  share: (reason?: ShareReason, rank?: HunterRank) => Promise<void>;
  /** Render this once; it is the fallback dialog. */
  dialog: ReactNode;
}

export function useShareCard(user: Pick<UserProfile, 'handle' | 'username' | 'auraPoints' | 'attributes' | 'streakDays' | 'level' | 'role' | 'totalWorkouts'>): ShareCardController {
  const handle = normalizeShareHandle(user.handle);
  const card = useMemo(() => buildRankCardData({ ...user, handle: user.handle }), [user]);
  const [dialog, setDialog] = useState<{ title: string; text: string } | null>(null);

  const share = useCallback(
    async (reason: ShareReason = 'profile', rank?: HunterRank) => {
      if (!handle) return;
      const url = absoluteUrl(window.location.origin, publicProfilePath(handle));
      const rankUp = reason === 'rankUp';
      const text = rankUp ? rankUpShareText(rank ?? card.rank) : rankShareText(card);
      const title = rankUp ? `Ranked up to ${rankLabel(rank ?? card.rank)}` : 'My AuraFit hunter card';
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({ title, text, url });
          return;
        } catch (err) {
          // The user closed the share sheet: done. Anything else: offer the dialog instead.
          if (err instanceof DOMException && err.name === 'AbortError') return;
        }
      }
      setDialog({ title: rankUp ? `You ranked up to ${rankLabel(rank ?? card.rank)}` : 'Share your hunter card', text });
    },
    [handle, card],
  );

  const node = handle ? (
    <ShareCardDialog
      open={dialog !== null}
      onClose={() => setDialog(null)}
      handle={handle}
      rank={card.rank}
      rankLabel={card.rankLabel}
      version={card.auraPoints}
      url={typeof window === 'undefined' ? publicProfilePath(handle) : absoluteUrl(window.location.origin, publicProfilePath(handle))}
      text={dialog?.text ?? rankShareText(card)}
      title={dialog?.title}
    />
  ) : null;

  return { available: handle !== null, share, dialog: node };
}
