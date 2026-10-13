import type { Metadata, Viewport } from 'next';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import { ServiceWorkerRegister } from '@/components/shell/ServiceWorkerRegister';
import './globals.css';

const FALLBACK_URL = 'https://aurafit.app';

function resolveSiteUrl(): URL {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || FALLBACK_URL);
  } catch {
    return new URL(FALLBACK_URL);
  }
}

const siteUrl = resolveSiteUrl();
const title = 'AuraFit — Gen Z & Gen Alpha RPG Fitness Platform';
const description =
  'Gamified fitness platform with Solo Leveling ranks, Aura points, daily quest boards, squad battles, and movement snacks.';

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: title, template: '%s · AuraFit' },
  description,
  applicationName: 'AuraFit',
  manifest: '/manifest.json',
  alternates: { canonical: '/' },
  openGraph: {
    title,
    description: 'Level up your physical stats, earn Aura points, lock in daily quests, and climb hunter ranks.',
    url: '/',
    siteName: 'AuraFit',
    images: [{ url: '/logo.jpg', width: 1024, height: 1024, alt: 'AuraFit logo' }],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AuraFit — Solo Leveling RPG Fitness',
    description: 'Level up your physical stats and earn Aura points with daily quests and phonk routines.',
    images: ['/logo.jpg'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AuraFit',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'dark light',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0A0C14' },
    { media: '(prefers-color-scheme: light)', color: '#F8FAFC' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is set pre-paint by THEME_INIT_SCRIPT, so the server markup differs by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
