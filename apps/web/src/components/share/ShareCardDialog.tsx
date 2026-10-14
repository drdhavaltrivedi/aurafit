'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, Download, ExternalLink, ImageOff, MessageCircle, Send } from 'lucide-react';
import { rankCardFileName, rankCardImagePath, shareIntentUrls, type HunterRank, type RankCardFormat } from '@aurafit/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cx } from '@/lib/cx';
import './share.css';

export interface ShareCardDialogProps {
  open: boolean;
  onClose: () => void;
  /** Stored handle, "@name". */
  handle: string;
  rank: HunterRank;
  rankLabel: string;
  /** Cache-busting version for the image URL (current aura). */
  version: number;
  /** Absolute /u/<handle> URL. */
  url: string;
  /** Prefilled share text for intent links. */
  text: string;
  title?: string;
}

const FORMATS: { value: RankCardFormat; label: string; hint: string }[] = [
  { value: 'story', label: 'Story', hint: '9:16 for Stories, TikTok and Reels' },
  { value: 'square', label: 'Square', hint: '1:1 for feeds and X' },
];

/**
 * Fallback share UI (when the Web Share API is unavailable): card preview, PNG download,
 * copy link and X / WhatsApp / Telegram intent links.
 */
export function ShareCardDialog({ open, onClose, handle, rank, rankLabel, version, url, text, title = 'Share your hunter card' }: ShareCardDialogProps) {
  const [format, setFormat] = useState<RankCardFormat>('story');
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const linkId = useId();
  const statusTimer = useRef<number | undefined>(undefined);
  const imagePath = rankCardImagePath(handle, format, version);
  const intents = shareIntentUrls(url, text);

  useEffect(() => setImageState('loading'), [imagePath]);
  useEffect(() => () => window.clearTimeout(statusTimer.current), []);
  useEffect(() => {
    if (!open) setStatus(null);
  }, [open]);

  const flash = useCallback((tone: 'ok' | 'error', message: string) => {
    window.clearTimeout(statusTimer.current);
    setStatus({ tone, text: message });
    statusTimer.current = window.setTimeout(() => setStatus(null), 4000);
  }, []);

  const download = useCallback(async () => {
    setDownloading(true);
    try {
      const res = await fetch(imagePath);
      if (!res.ok || !res.headers.get('content-type')?.startsWith('image/png')) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = rankCardFileName(rank);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
      flash('ok', `Saved ${rankCardFileName(rank)}.`);
    } catch {
      flash('error', 'Could not download the card. Check your connection and try again.');
    } finally {
      setDownloading(false);
    }
  }, [imagePath, rank, flash]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      flash('ok', 'Link copied to clipboard.');
    } catch {
      flash('error', 'Copying is blocked here. Select the link above and copy it.');
    }
  }, [url, flash]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={`${rankLabel} hunter card`}
      title={title}
      description="Your card shows public leaderboard stats only: name, handle, rank, aura, stats and streak."
    >
      <div className="share-dialog">
        <div className="share-format" role="radiogroup" aria-label="Card format">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={format === f.value}
              className={cx('share-format__option', format === f.value && 'is-active')}
              onClick={() => setFormat(f.value)}
            >
              <span className="share-format__label">{f.label}</span>
              <span className="share-format__hint">{f.hint}</span>
            </button>
          ))}
        </div>

        <div className={cx('share-preview', `share-preview--${format}`)} aria-busy={imageState === 'loading'}>
          {imageState === 'error' ? (
            <div className="share-preview__error">
              <ImageOff aria-hidden="true" />
              <span>Preview unavailable right now.</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic PNG from our own route; next/image adds nothing here.
            <img
              key={imagePath}
              src={imagePath}
              alt={`Preview of your ${rankLabel} AuraFit hunter card`}
              className={cx('share-preview__img', imageState === 'ready' && 'is-ready')}
              onLoad={() => setImageState('ready')}
              onError={() => setImageState('error')}
            />
          )}
          {imageState === 'loading' && <div className="share-preview__skeleton" aria-hidden="true" />}
        </div>

        <div className="share-actions">
          <Button leadingIcon={<Download />} onClick={download} disabled={downloading} aria-busy={downloading} block>
            {downloading ? 'Preparing PNG…' : 'Download PNG'}
          </Button>
        </div>

        <div className="share-link">
          <label htmlFor={linkId} className="share-link__label">
            Public card link
          </label>
          <div className="share-link__row">
            <input id={linkId} className="share-link__input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <Button variant="secondary" leadingIcon={<Copy />} onClick={copyLink}>
              Copy link
            </Button>
          </div>
        </div>

        <div className="share-intents" role="group" aria-label="Share to">
          <a className="btn btn--secondary btn--md share-intent" href={intents.x} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden="true" className="icon-inline" /> Post on X
          </a>
          <a className="btn btn--secondary btn--md share-intent" href={intents.whatsapp} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden="true" className="icon-inline" /> WhatsApp
          </a>
          <a className="btn btn--secondary btn--md share-intent" href={intents.telegram} target="_blank" rel="noopener noreferrer">
            <Send aria-hidden="true" className="icon-inline" /> Telegram
          </a>
        </div>

        <p className={cx('share-status', status?.tone === 'error' && 'is-error')} role="status" aria-live="polite">
          {status && (
            <>
              {status.tone === 'ok' && <Check aria-hidden="true" className="icon-inline" />} {status.text}
            </>
          )}
        </p>
      </div>
    </Modal>
  );
}
