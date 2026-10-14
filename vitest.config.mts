import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Pin root so workspace scripts (run with a different cwd) resolve the same globs.
  root: r('./'),
  // TSX under test (e.g. the next/og card routes) uses the automatic JSX runtime, like Next.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: [
      // Test against shared *source* so tests never depend on a stale dist build.
      { find: /^@aurafit\/shared$/, replacement: r('./packages/shared/src/index.ts') },
      { find: /^@\//, replacement: `${r('./apps/web/src')}/` },
      // `server-only` throws outside a React Server bundle; tests run in plain Node.
      { find: /^server-only$/, replacement: r('./apps/web/src/test/server-only-stub.ts') },
    ],
  },
  test: {
    environment: 'node',
    include: ['packages/*/test/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
  },
});
