import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/seo/site';

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/arena', '/account', '/auth/', '/login', '/signup', '/forgot-password', '/reset-password'],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
