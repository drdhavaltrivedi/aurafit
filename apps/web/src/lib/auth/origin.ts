/**
 * Public origin of the current request, used to build Supabase redirect URLs
 * (email confirmation, password reset, OAuth). Supabase Auth only redirects to
 * URLs on the project's allow list, so a spoofed Host header cannot be abused.
 */
export function originFromHeaders(h: Headers): string {
  const origin = h.get('origin');
  if (origin && /^https?:\/\/[^/\s]+$/.test(origin)) return origin;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (host && /^[A-Za-z0-9.\-:[\]]+$/.test(host)) {
    const proto = h.get('x-forwarded-proto')?.split(',')[0].trim() || (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* fall through */
    }
  }
  return 'http://localhost:3000';
}
