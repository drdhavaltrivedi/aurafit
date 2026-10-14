import { credentials, expect, expectNoHorizontalScroll, expectSingleH1, login, test, waitForArena } from './fixtures';

/**
 * Shareable rank cards: the public /u/<handle> page and the /api/og/rank image route.
 *
 * Env:
 *   E2E_SHARE_HANDLE   a seeded public profile handle (e.g. "@aurafit", the official coach profile).
 *                      Without it, the public-page tests are skipped.
 */
const shareHandle = process.env.E2E_SHARE_HANDLE?.trim() || '';
const slug = shareHandle.replace(/^@/, '');

test.describe('public hunter card', () => {
  test.skip(!slug, 'Set E2E_SHARE_HANDLE to a seeded public profile handle (e.g. @aurafit)');

  test('/u/<handle> renders public fields, noindex and og:image pointing at the square card', async ({ page }) => {
    const res = await page.goto(`/u/${slug}`);
    expect(res?.status()).toBe(200);
    await expectSingleH1(page);
    await expect(page.locator('#hunter-name')).toBeVisible();
    await expect(page.locator('.hunter-hero')).toContainText(`@${slug}`);
    await expect(page.getByRole('link', { name: /Join AuraFit|Open your arena/ })).toBeVisible();
    await expectNoHorizontalScroll(page);

    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toMatch(/noindex/);

    const ogImage = await page.locator('meta[property="og:image"]').first().getAttribute('content');
    expect(ogImage).toBeTruthy();
    const imageUrl = new URL(ogImage!);
    expect(imageUrl.pathname).toBe('/api/og/rank');
    expect(imageUrl.searchParams.get('handle')).toBe(slug);
    expect(imageUrl.searchParams.get('format')).toBe('square');
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');

    // No private data on the page.
    const html = await page.content();
    expect(html).not.toMatch(/auth_id|"email"/);

    // The og:image itself is a PNG (fetched on the same origin as the page under test).
    const img = await page.request.get(`${imageUrl.pathname}${imageUrl.search}`);
    expect(img.status()).toBe(200);
    expect(img.headers()['content-type']).toBe('image/png');
    expect(img.headers()['cache-control']).toContain('s-maxage=300');
  });

  test('the story card is a 1080x1920 PNG', async ({ request }) => {
    const img = await request.get(`/api/og/rank?handle=${encodeURIComponent(slug)}`);
    expect(img.status()).toBe(200);
    expect(img.headers()['content-type']).toBe('image/png');
    const bytes = await img.body();
    expect(bytes.readUInt32BE(16)).toBe(1080);
    expect(bytes.readUInt32BE(20)).toBe(1920);
  });
});

test.describe('card route input handling', () => {
  test('invalid and unknown handles still return images with the right status', async ({ request }) => {
    const bad = await request.get('/api/og/rank?handle=no%20spaces');
    expect(bad.status()).toBe(400);
    expect(bad.headers()['content-type']).toBe('image/png');

    const unknown = await request.get('/api/og/rank?handle=zz_no_such_hunter_e2e');
    // 503 only when the server has no database configured.
    expect([404, 503]).toContain(unknown.status());
    expect(unknown.headers()['content-type']).toBe('image/png');
  });

  test('unknown /u/<handle> is a 404 page', async ({ page, diagnostics }) => {
    diagnostics.allow(/status of 404/);
    const res = await page.goto('/u/zz_no_such_hunter_e2e');
    expect(res?.status()).toBe(404);
  });
});

test.describe('share UI', () => {
  test('demo: sharing is disabled with an explanation', async ({ page }) => {
    await page.goto('/demo');
    const button = page.getByRole('button', { name: 'Share your hunter card' });
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#profile-share-note')).toContainText("Demo profiles aren't public");
  });

  test('arena: Share opens the dialog (no Web Share API) with preview, download and links', async ({ page }) => {
    const creds = credentials('MEMBER');
    test.skip(!creds, 'No MEMBER credentials (set E2E_USERS_FILE or E2E_MEMBER_EMAIL/PASSWORD)');
    // Force the fallback dialog even in browsers that implement navigator.share.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    });
    await login(page, creds!, '/arena');
    await waitForArena(page);
    await page.getByRole('button', { name: 'Share your hunter card' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('img', { name: /hunter card/ })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Post on X' })).toHaveAttribute('href', /twitter\.com\/intent\/tweet/);
    await expect(dialog.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /wa\.me/);
    await expect(dialog.getByRole('link', { name: 'Telegram' })).toHaveAttribute('href', /t\.me\/share/);
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download PNG' }).click();
    expect((await download).suggestedFilename()).toMatch(/^aurafit-[a-z-]+\.png$/);
  });
});
