import { ImageResponse } from 'next/og';
import { RANK_CARD_SIZES, RANK_CARD_VERSION_PATTERN, buildRankCardData, normalizeShareHandle, parseRankCardFormat, type RankCardFormat } from '@aurafit/shared';
import { getRepository } from '@/lib/data';
import { siteOrigin } from '@/lib/seo/site';
import { loadOgAssets } from '@/lib/share/og-assets';
import { FallbackCardImage, RankCardImage } from '@/lib/share/rank-card-image';

// Node runtime: reads the bundled fonts/logo from disk and uses the service-role repository.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Found cards: shared CDN cache for 5 minutes, then served stale while revalidating for an hour. */
const CARD_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=3600';
/** Unknown / invalid handles: cache briefly so a new sign-up's card appears soon. */
const MISS_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';
const NO_STORE = 'no-store';

const siteHost = () => new URL(siteOrigin()).host;

async function fallback(format: RankCardFormat, status: number, cacheControl: string, title: string, subtitle: string): Promise<Response> {
  const assets = await loadOgAssets();
  return new ImageResponse(<FallbackCardImage format={format} logo={assets.logo} host={siteHost()} title={title} subtitle={subtitle} />, {
    ...RANK_CARD_SIZES[format],
    fonts: assets.fonts,
    status,
    headers: { 'cache-control': cacheControl, 'x-content-type-options': 'nosniff' },
  });
}

/**
 * GET /api/og/rank?handle=<handle>[&format=square][&v=<aura>] (public).
 * PNG rank card for a public profile: 1080x1920 by default, 1080x1080 with format=square.
 * Shows only public leaderboard fields. Every outcome is an image (with the right status) so
 * link unfurlers never get a broken preview.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const formatParam = parseRankCardFormat(params.get('format'));
  const format = formatParam ?? 'story';
  const handle = normalizeShareHandle(params.get('handle'));
  // Optional cache-busting version (?v=<aura>); ignored apart from validation.
  const version = params.get('v');
  const validVersion = version === null || RANK_CARD_VERSION_PATTERN.test(version);

  try {
    if (!formatParam || !handle || !validVersion) {
      return await fallback(format, 400, MISS_CACHE_CONTROL, 'AuraFit', 'Turn workouts into quests. Earn Aura. Climb the hunter ranks.');
    }

    const repo = getRepository();
    if (!repo) return await fallback(format, 503, NO_STORE, 'AuraFit', 'Turn workouts into quests. Earn Aura. Climb the hunter ranks.');

    const profile = await repo.getPublicProfileByHandle(handle);
    if (!profile) {
      return await fallback(format, 404, MISS_CACHE_CONTROL, 'Hunter not found', 'This hunter card does not exist yet. Start your own and climb the ranks.');
    }

    const [assets, card] = [await loadOgAssets(), buildRankCardData(profile)];
    return new ImageResponse(<RankCardImage card={card} format={format} logo={assets.logo} host={siteHost()} />, {
      ...RANK_CARD_SIZES[format],
      fonts: assets.fonts,
      headers: { 'cache-control': CARD_CACHE_CONTROL, 'x-content-type-options': 'nosniff' },
    });
  } catch (err) {
    console.error('[GET /api/og/rank]', err);
    try {
      return await fallback(format, 500, NO_STORE, 'AuraFit', 'Turn workouts into quests. Earn Aura. Climb the hunter ranks.');
    } catch {
      return new Response('Card unavailable', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': NO_STORE } });
    }
  }
}
