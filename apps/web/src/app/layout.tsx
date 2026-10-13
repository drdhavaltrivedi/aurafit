import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AuraFit — Gen Z & Gen Alpha RPG Fitness Platform',
  description: 'Gamified fitness platform with Solo Leveling ranks, Aura points, daily quest boards, squad battles, and movement snacks.',
  manifest: '/manifest.json',
  metadataBase: new URL('https://aurafit.app'),
  openGraph: {
    title: 'AuraFit — Gen Z & Gen Alpha RPG Fitness Platform',
    description: 'Level up your physical stats, earn Aura points, lock in daily quests, and climb hunter ranks.',
    url: 'https://aurafit.app',
    siteName: 'AuraFit',
    images: [
      {
        url: '/logo.jpg',
        width: 800,
        height: 800,
        alt: 'AuraFit Brand Logo',
      },
    ],
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
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AuraFit',
  },
};

export const viewport: Viewport = {
  themeColor: '#7C3AED',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body>
        {children}
        {/* Production PWA Service Worker Registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(reg) {
                      console.log('[AuraFit PWA] ServiceWorker registered with scope:', reg.scope);
                    },
                    function(err) {
                      console.log('[AuraFit PWA] ServiceWorker registration failed:', err);
                    }
                  );
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
