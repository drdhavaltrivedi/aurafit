import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/seo/site';

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: {
      userAgent: '*',
      // /api/og/ is allowed so link unfurlers that honour robots.txt (e.g. Twitterbot) can fetch
      // rank card images; /u/* pages are crawlable but carry noindex (see app/u/[handle]/page.tsx).
      allow: ['/', '/api/og/'],
      disallow: ['/api/', '/arena', '/account', '/auth/', '/login', '/signup', '/forgot-password', '/reset-password'],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
