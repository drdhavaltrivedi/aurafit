import { expect, expectNoHorizontalScroll, expectSingleH1, test } from './fixtures';

test.describe('landing', () => {
  test('renders every section and its CTAs work', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Level up your physical stats');
    for (const id of ['sim-title', 'gap-title', 'roles-title', 'platform-title']) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }

    // Simulator updates the rank badge.
    const range = page.locator('input[type="range"]');
    await range.fill('65000');
    await expect(page.locator('.simulator')).toContainText('MONARCH');

    // In-page anchor.
    await page.getByRole('link', { name: /Explore roles/ }).click();
    await expect(page).toHaveURL(/#roles$/);

    // Role card → demo with that persona preselected.
    await page.getByRole('button', { name: 'Try the Creator Studio' }).click();
    await page.waitForURL('**/demo');
    await expect(page.locator('#studio-title')).toBeVisible();

    // Hero CTA (signed out) → demo.
    await page.goto('/');
    await page.locator('#hero-enter-arena-btn').click();
    await page.waitForURL('**/demo');

    // Banner CTA + legal links + header auth links.
    await page.goto('/');
    await page.getByRole('button', { name: 'Launch the demo' }).click();
    await page.waitForURL('**/demo');
    await page.goto('/');
    await page.locator('.banner').getByRole('link', { name: 'Privacy Policy' }).click();
    await page.waitForURL('**/privacy');
    await page.goto('/');
    await page.locator('.site-footer').getByRole('link', { name: 'Terms' }).click();
    await page.waitForURL('**/terms');
    await page.goto('/');
    await page.locator('.site-header').getByRole('link', { name: 'Log in' }).click();
    await page.waitForURL('**/login');
    await page.goto('/');
    await page.locator('.site-header').getByRole('link', { name: 'Sign up' }).click();
    await page.waitForURL('**/signup');
  });
});

test.describe('demo arena', () => {
  test('sample data, role switcher, quest claim, workout runner, theme + sound toggles', async ({ page }) => {
    await page.goto('/demo');
    await expect(page.locator('.site-header')).toContainText('Demo mode');
    await expect(page.locator('#profile-name')).toBeVisible();

    // Claim a quest: aura chip + STR go up, success toast.
    const chip = page.locator('.site-header .aura-chip');
    const auraBefore = Number((await chip.innerText()).replace(/\D/g, ''));
    const claim = page.locator('[id^="claim-quest-"]').first();
    await claim.click();
    await expect(page.locator('.toast--success')).toContainText('Aura');
    await expect.poll(async () => Number((await chip.innerText()).replace(/\D/g, ''))).toBeGreaterThan(auraBefore);

    // Workout runner: start, pause/resume, reset, next, close via Escape and via button.
    await page.locator('[id^="start-workout-"]').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Exercise 1 of');
    await dialog.getByRole('button', { name: 'Pause' }).click();
    await expect(dialog.getByRole('button', { name: 'Resume' })).toBeVisible();
    const frozen = await dialog.getByRole('timer').innerText();
    await page.waitForTimeout(1200);
    expect(await dialog.getByRole('timer').innerText()).toBe(frozen);
    await dialog.getByRole('button', { name: /Reset/ }).click();
    await expect(dialog.getByRole('timer')).toContainText('45');
    await dialog.getByRole('button', { name: 'Next movement' }).click();
    await expect(dialog).toContainText('Exercise 2 of');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.locator('[id^="start-workout-"]').first().click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'End workout' }).click();
    await expect(dialog).toBeHidden();

    // Run a workout to the end and claim the Aura.
    await page.locator('[id^="start-workout-"]').first().click();
    await expect(dialog).toContainText('Exercise 1 of');
    while (await dialog.getByRole('button', { name: 'Next movement' }).isVisible()) {
      await dialog.getByRole('button', { name: 'Next movement' }).click();
    }
    await dialog.getByRole('button', { name: /Finish workout/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.toast-region')).toContainText(/Workout conquered|Aura/);

    // Role switcher (header variant on desktop).
    await page.locator('#nav-role-header-creator').click();
    await expect(page.locator('#studio-title')).toBeVisible();
    await expect(page.getByText('Sample data').first()).toBeVisible();
    await page.locator('#nav-role-header-admin').click();
    await expect(page.locator('#admin-title')).toBeVisible();
    await expect(page.getByText('Sample data').first()).toBeVisible();
    await page.locator('#nav-role-header-member').click();
    await expect(page.locator('#quests-title')).toBeVisible();

    // Theme toggle flips data-theme and persists across reloads.
    const html = page.locator('html');
    const before = await html.getAttribute('data-theme');
    await page.locator('#theme-toggle-btn').click();
    const after = before === 'dark' ? 'light' : 'dark';
    await expect(html).toHaveAttribute('data-theme', after);
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', after);

    // Sound toggle.
    const soundBtn = page.locator('#sound-toggle-btn');
    const pressed = await soundBtn.getAttribute('aria-pressed');
    await soundBtn.click();
    await expect(soundBtn).toHaveAttribute('aria-pressed', pressed === 'true' ? 'false' : 'true');
  });

  test('phone: bottom role switcher is used instead of the header one', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/demo');
    await expect(page.locator('#nav-role-header-creator')).toBeHidden();
    await page.locator('#nav-role-bottom-creator').click();
    await expect(page.locator('#studio-title')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('static & auth pages', () => {
  for (const [path, heading] of [
    ['/privacy', /Privacy/],
    ['/terms', /Terms/],
    ['/login', /Welcome back/],
    ['/signup', /.+/],
    ['/forgot-password', /.+/],
    ['/reset-password', /new password/i],
  ] as const) {
    test(`${path} renders`, async ({ page }) => {
      await page.goto(path);
      await expectSingleH1(page);
      await expect(page.locator('h1')).toHaveText(heading);
    });
  }

  test('reset-password without a session explains the link is invalid', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.locator('.alert[role="alert"]')).toContainText(/invalid or has expired/);
    await expect(page.getByRole('link', { name: 'Request a new link' })).toBeVisible();
  });

  test('404 page', async ({ page, diagnostics }) => {
    diagnostics.allow(/status of 404/);
    const res = await page.goto('/this-page-does-not-exist');
    expect(res?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText(/dungeon gate is closed/);
    await page.getByRole('link', { name: 'Back to AuraFit' }).click();
    await page.waitForURL((u) => u.pathname === '/');
  });
});

test.describe('auth forms (no real signup)', () => {
  test('signup validation: empty, bad email, short password, mismatch', async ({ page }) => {
    let posted = false;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/signup')) posted = true;
    });
    await page.goto('/signup');
    const submit = page.getByRole('button', { name: 'Create account' });

    await submit.click();
    await expect(page.locator('#signup-email-error')).toHaveText(/Enter your email/);
    await expect(page.locator('#signup-password-error')).toBeVisible();
    await expect(page.locator('#signup-confirm-error')).toBeVisible();
    await expect(page.locator('#signup-email')).toBeFocused();

    await page.locator('#signup-email').fill('not-an-email');
    await page.locator('#signup-password').fill('short');
    await page.locator('#signup-confirm').fill('short');
    await submit.click();
    await expect(page.locator('#signup-email-error')).toHaveText(/valid email/);
    await expect(page.locator('#signup-password-error')).toHaveText(/at least 8/);

    await page.locator('#signup-email').fill('someone@example.com');
    await page.locator('#signup-password').fill('longenough1');
    await page.locator('#signup-confirm').fill('different12');
    await submit.click();
    await expect(page.locator('#signup-email-error')).toHaveCount(0);
    await expect(page.locator('#signup-confirm-error')).toHaveText(/do not match/);
    expect(posted, 'invalid signup must not reach the server').toBe(false);
  });

  test('login with a wrong password shows a generic error', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#login-email').fill('nobody-e2e@aurafit.test');
    await page.locator('#login-password').fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.locator('.alert[role="alert"]')).toHaveText(/Incorrect email or password|Too many attempts/);
    await expect(page).toHaveURL(/\/login/);
  });

  test('forgot-password validates the email client-side', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.locator('#forgot-email-error')).toBeVisible();
  });
});

test.describe('auth redirects (signed out)', () => {
  for (const path of ['/arena', '/account']) {
    test(`${path} → /login?next=${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/%2F/g, '(%2F|/)')}`));
      await expect(page.locator('h1')).toHaveText(/Welcome back/);
    });
  }
});

test.describe('keyboard', () => {
  test('Tab reaches the skip link and the primary CTA on the landing page', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    let reached = false;
    for (let i = 0; i < 20 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.locator('#hero-enter-arena-btn').evaluate((el) => el === document.activeElement);
    }
    expect(reached, 'hero CTA reachable by Tab').toBe(true);
  });

  test('Tab reaches the login submit button', async ({ page }) => {
    await page.goto('/login');
    let reached = false;
    for (let i = 0; i < 20 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Log in' && document.activeElement.tagName === 'BUTTON');
    }
    expect(reached).toBe(true);
  });
});
