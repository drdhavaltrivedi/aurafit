import packageJson from '../../../../package.json';

export const dynamic = 'force-dynamic';

const DATABASE_ENV_KEYS = ['DATABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'] as const;

/**
 * Liveness/readiness probe. Reports only what this process can actually know:
 * whether a database is *configured* via env vars — not that it is reachable.
 */
export async function GET(): Promise<Response> {
  const databaseConfigured = DATABASE_ENV_KEYS.some((key) => Boolean(process.env[key]?.trim()));

  return Response.json(
    {
      status: 'ok',
      version: packageJson.version,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      services: {
        web: 'operational',
        database: databaseConfigured ? 'configured' : 'not_configured',
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
