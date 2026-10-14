import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a running AuraFit web server (no webServer is
 * started here: point E2E_BASE_URL at `next start`, a preview deploy, etc.).
 *
 * Specs run serially in file-name order because some of them share live test
 * accounts (e.g. 99-account-deletion.spec.ts deletes the MEMBER account last).
 *
 * Env:
 *   E2E_BASE_URL         default http://localhost:3010
 *   E2E_USERS_FILE       JSON { MEMBER|CREATOR|ADMIN: { email, password } }
 *   E2E_<ROLE>_EMAIL / E2E_<ROLE>_PASSWORD   alternative to the JSON file
 *   E2E_SCREENSHOT_DIR   where page screenshots go (default test-results/screens)
 *   E2E_ALLOW_DELETE=1   opt in to the destructive account-deletion spec
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  outputDir: 'test-results/artifacts',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3010',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The UI plays Web Audio cues; keep CI deterministic and quiet.
    launchOptions: { args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [{ name: 'chromium' }],
});
