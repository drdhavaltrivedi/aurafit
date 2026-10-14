import type { Page } from '@playwright/test';
import { expect, login, requireCredentials, signOut, test, waitForArena } from './fixtures';

const num = (s: string) => Number(s.replace(/[^\d]/g, '') || '0');
const auraOf = async (page: Page) => num(await page.locator('.site-header .aura-chip').innerText());
const statOf = async (page: Page, stat: string) =>
  num(await page.locator('.attr').filter({ hasText: new RegExp(`^${stat}\\b`) }).locator('.fw-800').innerText());

test.describe('MEMBER', () => {
  test('login honours ?next and lands on the arena with the real profile', async ({ page }) => {
    const creds = requireCredentials('MEMBER');
    await page.goto('/arena');
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.locator('#login-email').fill(creds.email);
    await page.locator('#login-password').fill(creds.password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.waitForURL('**/arena');
    await waitForArena(page);

    const me = await (await page.request.get('/api/v1/me')).json();
    const aura: number = me.profile.auraPoints;
    expect(await auraOf(page)).toBe(aura);
    await expect(page.locator('.profile__head')).toContainText(`${me.profile.rank} Hunter`);
    if (aura === 0) await expect(page.locator('.profile__head')).toContainText('E-RANK');
    // Quest board comes from the server.
    await expect(page.locator('.quest')).toHaveCount(me.quests.length);
    // No demo artefacts for a real account.
    await expect(page.getByText('Sample data')).toHaveCount(0);
    await expect(page.getByText('Demo mode')).toHaveCount(0);
    await expect(page.locator('img[src*="hunter-avatar"]')).toHaveCount(0);

    // Signed-in user visiting /login is sent to the arena.
    await page.goto('/login');
    await page.waitForURL('**/arena');
  });

  test('claim a quest: aura/stat update + toast; second claim gets "already" and no double award', async ({ browser, diagnostics }) => {
    const creds = requireCredentials('MEMBER');
    diagnostics.allow(/status of 409/);
    const context = await browser.newContext();
    const a = await context.newPage();
    await login(a, creds, '/arena');
    await waitForArena(a);
    // A second tab with the same (soon stale) quest board.
    const b = await context.newPage();
    await b.goto('/arena');
    await waitForArena(b);

    const button = a.locator('[id^="claim-quest-"]').first();
    test.skip((await button.count()) === 0, 'All quests already claimed today for this account');
    const questId = (await button.getAttribute('id'))!.replace('claim-quest-', '');
    // Which attribute this quest trains, from its "+N STAT" badge.
    const reward = await a.locator('.quest', { has: a.locator(`#claim-quest-${questId}`) }).locator('.badge', { hasText: /^\+\d+ (STR|AGI|END|REC)$/ }).innerText();
    const stat = reward.split(' ')[1];
    const auraBefore = await auraOf(a);
    const statBefore = await statOf(a, stat);

    await button.click();
    await expect(a.locator('.toast--success')).toContainText(/\+\d+ Aura/);
    await expect.poll(() => auraOf(a)).toBeGreaterThan(auraBefore);
    await expect.poll(() => statOf(a, stat)).toBeGreaterThan(statBefore);
    await expect(a.locator('.quest', { has: a.locator('.quest__done') })).not.toHaveCount(0);
    const auraAfter = await auraOf(a);

    // Stale tab still offers the quest; the server refuses (409) with a friendly toast.
    await b.locator(`#claim-quest-${questId}`).click();
    await expect(b.locator('.toast--warning')).toContainText(/already/i);
    await expect(b.locator(`#claim-quest-${questId}`)).toHaveCount(0);

    // Direct API replay: still 409 and no extra Aura.
    const replay = await a.request.post(`/api/v1/quests/${questId}/complete`, { headers: { Origin: new URL(a.url()).origin } });
    expect(replay.status()).toBe(409);
    const me = await (await a.request.get('/api/v1/me')).json();
    expect(me.profile.auraPoints).toBe(auraAfter);

    // After reload the quest is shown as claimed (server state).
    await a.reload();
    await waitForArena(a);
    await expect(a.locator(`#claim-quest-${questId}`)).toHaveCount(0);
    expect(await auraOf(a)).toBe(auraAfter);
    await context.close();
  });

  test('workout drops: list or intentional empty state; account menu; sign out', async ({ page, diagnostics }) => {
    const creds = requireCredentials('MEMBER');
    diagnostics.allow(/status of 409/);
    await login(page, creds, '/arena');
    await waitForArena(page);

    const starts = page.locator('[id^="start-workout-"]');
    if ((await starts.count()) === 0) {
      await expect(page.locator('section[aria-labelledby="drops-title"] .empty')).toBeVisible();
    } else {
      await starts.first().click();
      await expect(page.getByRole('dialog')).toContainText('Exercise 1 of');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
    }

    // Account menu → Account page.
    await page.locator('.account-menu__trigger').click();
    await expect(page.locator('.account-menu__panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.account-menu__panel')).toBeHidden();
    await page.locator('.account-menu__trigger').click();
    await page.getByRole('link', { name: 'Account' }).click();
    await page.waitForURL('**/account');
    await expect(page.locator('h1')).toHaveText('Your account');
    await expect(page.locator('.account__details')).toContainText(creds.email);
    await page.getByRole('link', { name: 'your arena' }).click();
    await page.waitForURL('**/arena');

    await signOut(page);
    await expect(page).toHaveURL((u) => u.pathname === '/');
    await page.goto('/arena');
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});
