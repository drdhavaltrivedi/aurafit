/* AuraFit service worker
 *
 * Strategy
 *  - Navigations (HTML): network-first, falling back to the cached page or '/'
 *    when offline. Deploys are therefore picked up immediately. Only public
 *    pages ('/', '/demo') are ever stored: signed-in pages (/arena), auth pages
 *    and redirected responses are never cached (no account data at rest).
 *  - /_next/static/*: cache-first (file names are content-hashed / immutable).
 *  - Allow-listed public assets (icons, logo, manifest): stale-while-revalidate.
 *  - Everything else (incl. /api/*, /_next/image, cross-origin, non-GET) is
 *    passed straight through and never cached.
 */
const VERSION = 'v2.2.0'; // bump purges caches from older versions
const STATIC_CACHE = `aurafit-static-${VERSION}`;
const PAGE_CACHE = `aurafit-pages-${VERSION}`;
const KNOWN_CACHES = [STATIC_CACHE, PAGE_CACHE];

const OFFLINE_URL = '/';
const PRECACHE = ['/', '/manifest.json', '/icon.svg', '/logo.jpg', '/icons/icon-192.png', '/icons/icon-512.png'];
const CACHEABLE_PAGE = /^\/(?:demo)?$/;
const PUBLIC_ASSET = /^\/(?:icon\.svg|logo\.jpg|manifest\.json|icons\/[\w.-]+\.(?:png|svg))$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Fetch fresh copies; a single failed asset must not abort install.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const res = await fetch(new Request(url, { cache: 'reload' }));
            if (isCacheable(res)) {
              await (url === OFFLINE_URL ? caches.open(PAGE_CACHE) : Promise.resolve(cache)).then((c) => c.put(url, res));
            }
          } catch (_) {
            /* ignore */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('aurafit') && !KNOWN_CACHES.includes(k)).map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => undefined);
      }
      await self.clients.claim();
    })(),
  );
});

function isCacheable(res) {
  return res && res.ok && res.status === 200 && res.type === 'basic';
}

async function networkFirstPage(event) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const preloaded = await event.preloadResponse;
    const res = preloaded || (await fetch(event.request));
    const url = new URL(event.request.url);
    if (isCacheable(res) && !res.redirected && CACHEABLE_PAGE.test(url.pathname)) {
      // Key pages by path only, so query strings don't bloat the cache.
      cache.put(url.pathname, res.clone()).catch(() => undefined);
    }
    return res;
  } catch (_) {
    const url = new URL(event.request.url);
    return (
      (await cache.match(url.pathname)) ||
      (await cache.match(OFFLINE_URL)) ||
      new Response('<h1>Offline</h1><p>Reconnect to keep levelling up.</p>', {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (isCacheable(res)) cache.put(request, res.clone()).catch(() => undefined);
  return res;
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(event.request);
  const network = fetch(event.request)
    .then((res) => {
      if (isCacheable(res)) cache.put(event.request, res.clone()).catch(() => undefined);
      return res;
    })
    .catch(() => cached);
  if (cached) {
    event.waitUntil(network.then(() => undefined));
    return cached;
  }
  return network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // cross-origin: browser default
  if (url.pathname.startsWith('/api/')) return; // never cache API traffic

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(event));
    return;
  }
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (PUBLIC_ASSET.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event));
  }
  // Anything else falls through to the network untouched.
});
