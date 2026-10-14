import type { Page } from '@playwright/test';
import {
  VIEWPORTS,
  expect,
  expectNoHorizontalScroll,
  expectSingleH1,
  login,
  requireCredentials,
  snap,
  test,
  waitForArena,
  type Credentials,
} from './fixtures';

/**
 * Onboarding (/onboarding). The full flow needs an account that has NOT finished onboarding
 * (profiles.onboarded_at IS NULL), e.g. a fresh sign-up:
 *   E2E_ONBOARDING_EMAIL / E2E_ONBOARDING_PASSWORD
 * The flow completes onboarding, so reset the account between runs (as the service role):
 *   UPDATE profiles SET onboarded_at = NULL, fitness_goal = NULL, fitness_level = NULL WHERE handle = '<handle>';
 * Accounts that existed when the migration ran are already onboarded (backfill).
 */
function onboardingCredentials(): Credentials {
  const email = process.env.E2E_ONBOARDING_EMAIL;
  const password = process.env.E2E_ONBOARDING_PASSWORD;
  test.skip(!email || !password, 'No un-onboarded account (set E2E_ONBOARDING_EMAIL / E2E_ONBOARDING_PASSWORD)');
  return { email: email!, password: password! };
}

const heading = (page: Page) => page.locator('h1');

test.describe('Onboarding', () => {
  test('signed-out visitors are sent to login', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/login\?next=%2Fonboarding/);
  });

  test('already-onboarded members skip onboarding and see their profile flags', async ({ page }) => {
    const creds = requireCredentials('MEMBER');
    await login(page, creds, '/arena');
    await waitForArena(page);
    const me = await (await page.request.get('/api/v1/me')).json();
    expect(me.profile.onboarded).toBe(true);
    await page.goto('/onboarding');
    await page.waitForURL('**/arena');
  });

  test('dark and light themes render the first step', async ({ page }) => {
    const creds = onboardingCredentials();
    await login(page, creds, '/onboarding');
    test.skip(!page.url().includes('/onboarding'), 'Account already onboarded (reset it to re-run)');
    for (const theme of ['dark', 'light'] as const) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await snap(page, `onboarding-1-welcome-${theme}`);
    }
  });

  test('full flow at 390px: gate, keyboard steps, back, finish, start recommended workout', async ({ page, diagnostics }) => {
    const creds = onboardingCredentials();
    // The streak-saver endpoint may not be deployed yet; onboarding treats 404/501 as non-fatal.
    diagnostics.allow(/notification-settings.*status of (404|501)/);
    await page.setViewportSize(VIEWPORTS.phone);

    await login(page, creds, '/arena');
    // Gate: un-onboarded users land on /onboarding instead of the arena.
    await page.waitForURL('**/onboarding');
    await expectSingleH1(page);
    await expect(page.getByText('Step 1 of 4')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await snap(page, 'onboarding-1-welcome-phone');

    // Step 1: name. Validation, then Enter submits.
    const name = page.getByLabel('Display name');
    await name.fill('   ');
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByRole('alert')).toContainText('Enter a display name');
    await name.fill('Onboarding Hunter');
    await name.press('Enter');

    // Step 2: goal (focus moves to the heading).
    await expect(heading(page)).toHaveText('What brings you to AuraFit?');
    await expect(heading(page)).toBeFocused();
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByRole('alert')).toContainText('Pick the goal');
    await page.getByRole('radio', { name: /Lose weight/ }).check();
    await expectNoHorizontalScroll(page);
    await snap(page, 'onboarding-2-goal-phone');
    await page.getByTestId('onboarding-next').click();

    // Step 3: level, then go back and forward (answers are kept).
    await expect(heading(page)).toHaveText('How much do you train right now?');
    await page.getByTestId('onboarding-back').click();
    await expect(page.getByRole('radio', { name: /Lose weight/ })).toBeChecked();
    await page.getByTestId('onboarding-next').click();
    // Keyboard: focus a radio card and select it with Space.
    await page.getByRole('radio', { name: /Beginner/ }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('radio', { name: /Beginner/ })).toBeChecked();
    await page.getByTestId('onboarding-next').click();

    // Step 4: reminder + streak saver.
    await expect(heading(page)).toHaveText('When should we nudge you?');
    await expect(page.getByRole('checkbox', { name: /Streak saver/ })).toBeChecked();
    await page.getByRole('radio', { name: '8 PM' }).check();
    await snap(page, 'onboarding-4-reminder-phone');
    const patch = page.waitForResponse((r) => r.url().endsWith('/api/v1/me') && r.request().method() === 'PATCH');
    const put = page.waitForRequest((r) => r.url().includes('/api/v1/me/notification-settings') && r.method() === 'PUT');
    await page.getByTestId('onboarding-finish').click();
    expect((await patch).status()).toBe(200);
    const settings = JSON.parse((await put).postData() ?? '{}');
    expect(settings).toMatchObject({ streakSaver: true, dailyReminderHour: 20 });
    expect(typeof settings.timezone).toBe('string');

    // Finish screen: beginner + lose weight → the 7-minute cardio snack (never BEAST/SHADOW).
    await expect(heading(page)).toHaveText('Ready, Onboarding Hunter?');
    await expect(page.getByRole('heading', { name: /Cardio Snack/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await snap(page, 'onboarding-5-done-phone');

    const me = await (await page.request.get('/api/v1/me')).json();
    expect(me.profile).toMatchObject({ onboarded: true, fitnessGoal: 'LOSE_WEIGHT', fitnessLevel: 'BEGINNER' });

    await page.getByTestId('onboarding-start-now').click();
    await page.waitForURL((u) => u.pathname === '/arena');
    await expect(page.getByRole('dialog')).toContainText(/Cardio Snack/);
    await expect(page).not.toHaveURL(/start=/);

    // Onboarded now: /onboarding sends them to the arena.
    await page.goto('/onboarding');
    await page.waitForURL('**/arena');
  });

});
