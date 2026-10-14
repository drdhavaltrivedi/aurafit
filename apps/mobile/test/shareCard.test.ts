import { describe, expect, it } from 'vitest';
import { INITIAL_USER } from '@aurafit/shared';
import { DEMO_SHARE_REASON, planShareCard, shareErrorMessage } from '../src/lib/shareCard';

const SITE = 'https://aurafit-alpha-one.vercel.app/';

describe('planShareCard', () => {
  it('builds the versioned story image URL, page URL, filename and message', () => {
    const res = planShareCard(INITIAL_USER, SITE, { demo: false });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.imageUrl).toBe('https://aurafit-alpha-one.vercel.app/api/og/rank?handle=kai_levels&v=8450');
    expect(res.plan.pageUrl).toBe('https://aurafit-alpha-one.vercel.app/u/kai_levels');
    expect(res.plan.fileName).toBe('aurafit-b-rank.png');
    expect(res.plan.message).toContain('B-Rank on AuraFit');
    expect(res.plan.message.endsWith(res.plan.pageUrl)).toBe(true);
  });

  it('uses rank-up wording when sharing from a rank-up prompt', () => {
    const res = planShareCard(INITIAL_USER, SITE, { demo: false, rankUp: 'A-RANK' });
    expect(res.ok && res.plan.title).toBe('Ranked up to A-Rank');
    expect(res.ok && res.plan.message).toContain('I just ranked up to A-Rank');
  });

  it('is disabled in demo mode, without a server, or without a valid handle', () => {
    expect(planShareCard(INITIAL_USER, SITE, { demo: true })).toEqual({ ok: false, reason: DEMO_SHARE_REASON });
    expect(planShareCard(null, SITE, { demo: false }).ok).toBe(false);
    expect(planShareCard(INITIAL_USER, null, { demo: false }).ok).toBe(false);
    expect(planShareCard({ ...INITIAL_USER, handle: '' }, SITE, { demo: false }).ok).toBe(false);
  });
});

describe('shareErrorMessage', () => {
  it('maps errors to friendly text', () => {
    expect(shareErrorMessage(new Error('UnableToDownload: status 404'))).toMatch(/couldn't find/i);
    expect(shareErrorMessage(new Error('Network request failed'))).toMatch(/connection/);
    expect(shareErrorMessage('weird')).toMatch(/try again/);
  });
});
