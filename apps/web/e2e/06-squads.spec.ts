import { expect, expectNoHorizontalScroll, login, requireCredentials, test, VIEWPORTS, waitForArena, snap } from './fixtures';

/**
 * Squads on a live server. Needs a MEMBER account (skips otherwise). The test leaves any squad the
 * account is in, creates a throwaway squad, checks the leader view / invite link / leaderboard /
 * /join flow, and leaves again (the last member leaving deletes the squad).
 */
test.describe('SQUADS', () => {
  test('signed-out /join/<code> goes to login and comes back', async ({ page }) => {
    await page.goto('/join/K7MX2QPA');
    await expect(page).toHaveURL(/\/login\?next=%2Fjoin%2FK7MX2QPA/);
  });

  test('create, invite, leaderboard, join page, leave', async ({ page, diagnostics }) => {
    const creds = requireCredentials('MEMBER');
    diagnostics.allow(/status of 409/);
    await login(page, creds, '/arena');
    await waitForArena(page);

    // Start from "no squad".
    const me = await (await page.request.get('/api/v1/squads/me')).json();
    if (me.squad) {
      await page.locator('#squad-leave').click();
      await page.getByRole('dialog').getByRole('button', { name: 'Leave squad' }).click();
      await expect(page.locator('#squad-create')).toBeVisible();
    }
    await expect(page.getByText('Squads coming soon')).toHaveCount(0);

    const suffix = Date.now().toString(36).slice(-4).toUpperCase();
    await page.locator('#squad-create').click();
    const dialog = page.getByRole('dialog', { name: 'Create a squad' });
    await dialog.getByLabel('Squad name').fill(`E2E Squad ${suffix}`);
    await dialog.getByLabel('Tag').fill(`E${suffix}`.slice(0, 6));
    await dialog.getByRole('radio', { name: 'crown' }).check();
    await dialog.getByRole('button', { name: 'Create squad' }).click();
    await expect(dialog).toHaveCount(0);

    const panel = page.locator('#squad-panel');
    await expect(panel).toContainText(`E2E Squad ${suffix}`);
    await expect(panel).toContainText('Leader');
    const code = (await page.locator('#squad-invite-code').innerText()).trim();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    await expect(panel).toContainText(`/join/${code}`);
    await expect(panel.getByRole('progressbar')).toBeVisible();

    // Public leaderboard lists it (no member details).
    const board = await (await page.request.get('/api/v1/squads/leaderboard')).json();
    expect(board.squads.some((s: { name: string }) => s.name === `E2E Squad ${suffix}`)).toBe(true);
    expect(JSON.stringify(board)).not.toContain(code);
    await expect(page.locator('#squad-leaderboard')).toContainText(`E2E Squad ${suffix}`);

    // Phone layout.
    await page.setViewportSize(VIEWPORTS.phone);
    await panel.scrollIntoViewIfNeeded();
    await expectNoHorizontalScroll(page);
    await snap(page, 'squads-arena-phone');
    await page.setViewportSize(VIEWPORTS.desktop);

    // Own invite link while already in a squad: explains instead of joining.
    await page.goto(`/join/${code}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Join a squad' })).toBeVisible();
    await expect(page.getByText(/already in/)).toBeVisible();

    // Leave → last member → squad deleted.
    await page.goto('/arena');
    await waitForArena(page);
    await page.locator('#squad-leave').click();
    await expect(page.getByRole('dialog')).toContainText('the squad will be deleted');
    await page.getByRole('dialog').getByRole('button', { name: 'Leave squad' }).click();
    await expect(page.locator('#squad-create')).toBeVisible();
    const after = await (await page.request.get('/api/v1/squads/me')).json();
    expect(after.squad).toBeNull();
  });
});
