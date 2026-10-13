import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Pin root so workspace scripts (run with a different cwd) resolve the same globs.
  root: r('./'),
  resolve: {
    alias: [
      // Test against shared *source* so tests never depend on a stale dist build.
      { find: /^@aurafit\/shared$/, replacement: r('./packages/shared/src/index.ts') },
      { find: /^@\//, replacement: `${r('./apps/web/src')}/` },
    ],
  },
  test: {
    environment: 'node',
    include: ['packages/*/test/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
  },
});
