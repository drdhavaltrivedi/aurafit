import { credentials, expect, login, requireCredentials, test, waitForArena } from './fixtures';

test.describe('CREATOR', () => {
  test('studio shows real stats; Create Drop validates, publishes, and members can complete it once per day', async ({ page, browser, diagnostics }) => {
    const creds = requireCredentials('CREATOR');
    diagnostics.allow(/status of 409/);
    await login(page, creds, '/arena');
    await waitForArena(page);

    const studio = page.locator('section[aria-labelledby="studio-title"]');
    await expect(studio).toBeVisible();
    // Real figures only: no fabricated revenue / subscriber counts.
    await expect(studio).not.toContainText('$');
    await expect(studio).not.toContainText('MRR');
    await expect(studio).toContainText('Coming soon');
    await expect(page.getByText('Sample data')).toHaveCount(0);

    const published = page.locator('section[aria-labelledby="published-title"]');
    const before = await published.locator('.row-item').count();
    await expect(studio.locator('.stat-tile').filter({ hasText: 'Published drops' }).locator('.stat-tile__value')).toHaveText(String(before));
    if (before === 0) await expect(published.locator('.empty')).toContainText("haven't published");

    // Validation errors first.
    await page.locator('#create-drop-modal-btn').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Routine title')).toBeFocused();
    await dialog.getByLabel('Routine title').fill('ab');
    await dialog.getByLabel('Duration (minutes)').fill('999');
    await dialog.getByLabel('Aura multiplier').fill('9');
    await dialog.getByRole('button', { name: 'Publish routine' }).click();
    await expect(dialog.locator('.field__error')).toHaveCount(3);
    await expect(dialog).toContainText('at least 3 characters');
    await expect(dialog.getByLabel('Routine title')).toBeFocused();

    // Then a valid drop.
    const title = `E2E Core Reset ${Date.now().toString(36)}`;
    await dialog.getByLabel('Routine title').fill(title);
    await dialog.getByLabel('Duration (minutes)').fill('12');
    await dialog.getByLabel('Aura multiplier').fill('1.5');
    await dialog.getByRole('button', { name: 'Publish routine' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.toast--success')).toContainText('is live');
    await expect(published.locator('.row-item')).toHaveCount(before + 1);
    await expect(published).toContainText(title);

    // Persisted on the server.
    await page.reload();
    await waitForArena(page);
    await expect(published).toContainText(title);

    // A member sees it in Trending drops and can complete it once per UTC day.
    const member = credentials('MEMBER');
    test.skip(!member, 'No MEMBER credentials to complete the new drop');
    const ctx = await browser.newContext();
    const m = await ctx.newPage();
    m.on('response', (r) => {
      if (r.status() >= 400 && r.status() !== 401 && r.status() !== 409) throw new Error(`member http ${r.status()} ${r.url()}`);
    });
    await login(m, member!, '/arena');
    await waitForArena(m);
    const card = m.locator('.drop', { hasText: title });
    await expect(card).toBeVisible();
    const runWorkout = async () => {
      await card.getByRole('button', { name: `Start session: ${title}` }).click();
      const d = m.getByRole('dialog');
      await expect(d).toContainText('Exercise 1 of');
      while (await d.getByRole('button', { name: 'Next movement' }).isVisible()) {
        await d.getByRole('button', { name: 'Next movement' }).click();
      }
      await d.getByRole('button', { name: /Finish workout/ }).click();
      await expect(d).toBeHidden();
    };
    const auraBefore = Number((await m.locator('.site-header .aura-chip').innerText()).replace(/\D/g, ''));
    await runWorkout();
    await expect(m.locator('.toast--success')).toContainText('Workout conquered');
    const auraAfter = Number((await m.locator('.site-header .aura-chip').innerText()).replace(/\D/g, ''));
    expect(auraAfter).toBeGreaterThan(auraBefore);

    await m.locator('.toast__close').click();
    await runWorkout();
    await expect(m.locator('.toast--warning')).toContainText('already logged this workout today');
    expect(Number((await m.locator('.site-header .aura-chip').innerText()).replace(/\D/g, ''))).toBe(auraAfter);
    await ctx.close();
  });
});

test.describe('ADMIN', () => {
  test('admin console shows "Coming soon" and no fabricated numbers', async ({ page }) => {
    const creds = requireCredentials('ADMIN');
    await login(page, creds, '/arena');
    await waitForArena(page);
    const admin = page.locator('section[aria-labelledby="admin-title"]');
    await expect(admin).toBeVisible();
    await expect(admin).toContainText('Coming soon');
    await expect(page.getByText('Sample data')).toHaveCount(0);
    for (const fake of ['42,850', '94.2%', 'Tokyo', 'Optimal', '$2,450']) {
      await expect(page.locator('main')).not.toContainText(fake);
    }
  });
});
