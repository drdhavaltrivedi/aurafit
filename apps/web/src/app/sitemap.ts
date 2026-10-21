import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/seo/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  const lastModified = new Date();
  return [
    { url: `${origin}/`, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${origin}/demo`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${origin}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${origin}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${origin}/support`, lastModified, changeFrequency: 'monthly', priority: 0.4 },
  ];
}
