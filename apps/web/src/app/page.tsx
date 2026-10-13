import { AuraFitApp } from '@/components/AuraFitApp';
import { ToastProvider } from '@/components/ui/Toast';
import { getViewer } from '@/lib/auth/viewer';
import { siteOrigin } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

// schema.org structured data so search engines can show AuraFit as an app result.
function structuredData() {
  const origin = siteOrigin();
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: `${origin}/`,
        name: 'AuraFit',
        description: 'Gamified fitness RPG with daily workout quests, streaks and ranks.',
        inLanguage: 'en',
      },
      {
        '@type': 'SoftwareApplication',
        name: 'AuraFit',
        url: `${origin}/`,
        image: `${origin}/icons/icon-512.png`,
        applicationCategory: 'HealthApplication',
        applicationSubCategory: 'Fitness',
        operatingSystem: 'Web, Android, iOS',
        description:
          'Turn exercise into an RPG. Complete daily workout quests, build streaks, earn Aura points and level up your STR, AGI, END and REC stats with quick home workouts.',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
    ],
  };
}

export default async function HomePage() {
  const viewer = await getViewer();
  return (
    <ToastProvider>
      <script
        type="application/ld+json"
        // JSON.stringify output contains no user input; escape "<" so it can't close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()).replace(/</g, '\\u003c') }}
      />
      <AuraFitApp page="landing" viewer={viewer} />
    </ToastProvider>
  );
}
