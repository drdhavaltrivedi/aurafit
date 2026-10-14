import { expect, login, requireCredentials, test } from './fixtures';

/**
 * Destructive: permanently deletes the MEMBER account. Runs last (file order,
 * workers: 1) and only when E2E_ALLOW_DELETE=1.
 */
test.describe('account deletion (MEMBER)', () => {
  test.skip(process.env.E2E_ALLOW_DELETE !== '1', 'Set E2E_ALLOW_DELETE=1 to run the destructive deletion test');

  test('typed DELETE confirmation deletes the account and signs out', async ({ page }) => {
    const creds = requireCredentials('MEMBER');
    await login(page, creds, '/account');
    await page.waitForURL('**/account');

    await page.getByRole('button', { name: 'Delete account' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByLabel(/Type DELETE to confirm/);
    await expect(confirm).toBeFocused();
    const submit = dialog.getByRole('button', { name: 'Delete my account' });
    await expect(submit).toBeDisabled();
    await confirm.fill('delete');
    await expect(submit).toBeDisabled();
    // Cancel closes without deleting.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Delete account' }).click();
    await dialog.getByLabel(/Type DELETE to confirm/).fill('DELETE');
    await expect(submit).toBeEnabled();
    await submit.click();

    await page.waitForURL((u) => u.pathname === '/');
    await expect(page.locator('.toast--success')).toContainText('account and its data have been deleted');
    await expect(page).not.toHaveURL(/account=deleted/);

    await page.goto('/arena');
    await expect(page).toHaveURL(/\/login\?next=/);

    // Logging in again fails with the generic error.
    await page.locator('#login-email').fill(creds.email);
    await page.locator('#login-password').fill(creds.password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.locator('.alert[role="alert"]')).toHaveText(/Incorrect email or password/);
  });
});
