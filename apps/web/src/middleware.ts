import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Next.js 15: this file must be named middleware.ts (proxy.ts is Next 16+).
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets, the service worker, the manifest and the
    // health probe. API routes are included so cookie sessions refresh there too.
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|api/health|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
