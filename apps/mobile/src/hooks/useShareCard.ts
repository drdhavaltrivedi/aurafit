import { useCallback, useRef, useState } from 'react';
import { Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { HunterRank } from '@aurafit/shared';
import { siteUrl } from '../config/env';
import { planShareCard, shareErrorMessage, type ShareCardUser } from '../lib/shareCard';

export interface ShareCardState {
  /** False in demo mode / without a server; `disabledReason` says why. */
  enabled: boolean;
  disabledReason: string | null;
  loading: boolean;
  error: string | null;
  /** Downloads the PNG and opens the native share sheet (falls back to sharing the /u/<handle> link). */
  share: (rankUp?: HunterRank) => Promise<void>;
  clearError: () => void;
}

/**
 * Share the user's rank card: GET /api/og/rank?handle=… into the cache directory with
 * expo-file-system, then expo-sharing's native share sheet. When file sharing is unavailable
 * (or the download fails) it falls back to React Native's Share with the public page URL.
 */
export function useShareCard(user: ShareCardUser | null, demo: boolean): ShareCardState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const probe = planShareCard(user, siteUrl, { demo });

  const userRef = useRef(user);
  userRef.current = user;

  const share = useCallback(
    async (rankUp?: HunterRank) => {
      const res = planShareCard(userRef.current, siteUrl, { demo, rankUp });
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      if (busy.current) return;
      busy.current = true;
      setLoading(true);
      setError(null);
      const { plan } = res;
      try {
        let fileUri: string | null = null;
        if (await Sharing.isAvailableAsync()) {
          try {
            const file = await File.downloadFileAsync(plan.imageUrl, new File(Paths.cache, plan.fileName), { idempotent: true });
            fileUri = file.uri;
          } catch (err) {
            // Image unavailable: still let the user share the link below.
            if (__DEV__) console.warn('[share] card download failed', err);
            setError(shareErrorMessage(err));
          }
        }
        if (fileUri) {
          await Sharing.shareAsync(fileUri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: plan.title });
        } else {
          await Share.share({ title: plan.title, message: plan.message, url: plan.pageUrl }, { dialogTitle: plan.title });
        }
      } catch (err) {
        setError(shareErrorMessage(err));
      } finally {
        busy.current = false;
        setLoading(false);
      }
    },
    [demo]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    enabled: probe.ok,
    disabledReason: probe.ok ? null : probe.reason,
    loading,
    error,
    share,
    clearError,
  };
}
