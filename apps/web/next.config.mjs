import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Supabase origins the browser may talk to (REST/Auth over https, Realtime over
 * wss). *.supabase.co covers hosted projects; a custom domain or local stack
 * from NEXT_PUBLIC_SUPABASE_URL is added explicitly (read at build time).
 */
function supabaseOrigins() {
  const origins = ['https://*.supabase.co', 'wss://*.supabase.co'];
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    if (!url.hostname.endsWith('.supabase.co')) {
      origins.push(url.origin, `${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}`);
    }
  } catch {
    // Not configured: wildcard entries only.
  }
  return origins.join(' ');
}

/**
 * Content-Security-Policy.
 *
 * - Next.js App Router streams RSC payloads via inline <script> tags and the
 *   layout ships small inline scripts (theme init / service-worker
 *   registration), so 'unsafe-inline' is required for script-src unless a
 *   nonce-based middleware is introduced.
 * - 'unsafe-eval' is only needed by React Refresh / webpack in development.
 * - Remote images (images.unsplash.com, Google avatars) are proxied through
 *   /_next/image, so they are same-origin; hosts are still allowed for <img>.
 * - form-action allows Supabase/Google because the OAuth server action
 *   redirects there (Chrome applies form-action to post-submit redirects).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigins()}${isDev ? ' ws: wss:' : ''}`,
  "media-src 'self' data: blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.supabase.co https://accounts.google.com",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  // Linting runs as its own step (`npm run lint -w apps/web`, enforced in CI),
  // so `next build` does not need to re-run it. Type checking still runs.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@aurafit/shared'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        // Google OAuth profile pictures (profiles.avatar_url from the signup trigger).
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
