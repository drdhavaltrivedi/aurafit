import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Mobile pure-logic tests only (no React Native runtime). Modules under test must not import
// react-native / expo packages. Run with `npm test` here or `npx vitest run --root apps/mobile`.
export default defineConfig({
  root: r('./'),
  resolve: {
    alias: [{ find: /^@aurafit\/shared$/, replacement: r('../../packages/shared/src/index.ts') }],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
  },
});
