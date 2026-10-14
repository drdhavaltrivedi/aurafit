import type { Page } from '@playwright/test';
import {
  VIEWPORTS,
  credentials,
  expect,
  expectHeaderFits,
  expectNoHorizontalScroll,
  expectSingleH1,
  login,
  snap,
  test,
  waitForArena,
  type Role,
  type ViewportName,
} from './fixtures';

const THEMES = ['light', 'dark'] as const;
const THEME_KEY = 'aurafit.theme.v2';

async function setTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.evaluate(([k, t]) => localStorage.setItem(k, t), [THEME_KEY, theme] as const);
}

/** Visits `path` at every viewport × theme: screenshot, one h1, no sideways scroll. */
async function sweep(page: Page, name: string, path: string, ready?: (page: Page) => Promise<void>) {
  for (const theme of THEMES) {
    for (const vp of Object.keys(VIEWPORTS) as ViewportName[]) {
      await page.setViewportSize(VIEWPORTS[vp]);
      await page.goto(path);
      await setTheme(page, theme);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      if (ready) await ready(page);
      await expectSingleH1(page);
      await expectNoHorizontalScroll(page);
      await expectHeaderFits(page);
      await snap(page, `${name}--${vp}--${theme}`);
    }
  }
}

const PUBLIC_PAGES: [string, string][] = [
  ['landing', '/'],
  ['demo', '/demo'],
  ['privacy', '/privacy'],
  ['terms', '/terms'],
  ['login', '/login'],
  ['signup', '/signup'],
  ['forgot-password', '/forgot-password'],
  ['reset-password', '/reset-password'],
];

test.describe('visual sweep: public pages', () => {
  for (const [name, path] of PUBLIC_PAGES) {
    test(name, async ({ page }) => {
      await sweep(page, name, path, name === 'demo' ? (p) => expect(p.locator('#profile-name')).toBeVisible() : undefined);
    });
  }

  test('404', async ({ page, diagnostics }) => {
    diagnostics.allow(/status of 404/);
    await sweep(page, '404', '/no-such-page');
  });

  test('demo personas + workout modal', async ({ page }) => {
    for (const vp of ['phone', 'tablet', 'desktop'] as const) {
      await page.setViewportSize(VIEWPORTS[vp]);
      for (const theme of THEMES) {
        await page.goto('/demo');
        await setTheme(page, theme);
        for (const role of ['creator', 'admin'] as const) {
          await page.reload();
          await page.locator(vp !== 'desktop' ? `#nav-role-bottom-${role}` : `#nav-role-header-${role}`).click();
          await expect(page.locator(role === 'creator' ? '#studio-title' : '#admin-title')).toBeVisible();
          await expectNoHorizontalScroll(page);
          await expectHeaderFits(page);
          await snap(page, `demo-${role}--${vp}--${theme}`);
        }
        await page.locator(vp !== 'desktop' ? '#nav-role-bottom-member' : '#nav-role-header-member').click();
        await page.locator('[id^="start-workout-"]').first().click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await snap(page, `demo-workout--${vp}--${theme}`, { fullPage: false });
        await page.keyboard.press('Escape');
      }
    }
  });
});

test.describe('visual sweep: signed-in pages', () => {
  for (const role of ['MEMBER', 'CREATOR', 'ADMIN'] as Role[]) {
    test(`arena as ${role}`, async ({ page }) => {
      const creds = credentials(role);
      test.skip(!creds, `No ${role} credentials`);
      await login(page, creds!, '/arena');
      await sweep(page, `arena-${role.toLowerCase()}`, '/arena', waitForArena);
      if (role === 'CREATOR') {
        for (const vp of ['phone', 'desktop'] as const) {
          await page.setViewportSize(VIEWPORTS[vp]);
          await page.goto('/arena');
          await waitForArena(page);
          await page.locator('#create-drop-modal-btn').click();
          await page.getByRole('dialog').getByRole('button', { name: 'Publish routine' }).click();
          await expect(page.getByRole('dialog').locator('.field__error').first()).toBeVisible();
          await snap(page, `create-drop-errors--${vp}`, { fullPage: false });
          await page.keyboard.press('Escape');
        }
      }
      if (role === 'MEMBER') {
        await sweep(page, 'account', '/account');
        await page.setViewportSize(VIEWPORTS.phone);
        await page.goto('/arena');
        await waitForArena(page);
        await page.locator('.account-menu__trigger').click();
        await expect(page.locator('.account-menu__panel')).toBeVisible();
        await expectNoHorizontalScroll(page);
        await snap(page, `account-menu--phone`, { fullPage: false });
      }
    });
  }
});

test.describe('links & keyboard', () => {
  test('every link on every page resolves (no dead routes or anchors)', async ({ page, browser }) => {
    const pages = PUBLIC_PAGES.map(([, p]) => p);
    const checked = new Map<string, number>();
    const problems: string[] = [];

    const audit = async (p: Page, path: string) => {
      await p.goto(path);
      const hrefs = await p.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href') ?? ''));
      for (const href of hrefs) {
        if (href.startsWith('mailto:')) continue;
        if (href.startsWith('#')) {
          if ((await p.locator(`[id="${href.slice(1)}"]`).count()) === 0) problems.push(`${path}: missing anchor ${href}`);
          continue;
        }
        const url = new URL(href, p.url());
        if (url.origin !== new URL(p.url()).origin) continue;
        if (url.hash && url.pathname !== new URL(p.url()).pathname) {
          const probe = await browser.newPage();
          await probe.goto(url.pathname);
          if ((await probe.locator(`[id="${url.hash.slice(1)}"]`).count()) === 0) problems.push(`${path}: missing anchor ${href}`);
          await probe.close();
        }
        const key = url.pathname + url.search;
        if (!checked.has(key)) {
          const res = await p.request.get(key, { maxRedirects: 5 });
          checked.set(key, res.status());
        }
        if (checked.get(key)! >= 400) problems.push(`${path}: ${href} → ${checked.get(key)}`);
      }
    };

    for (const path of pages) await audit(page, path);
    const member = credentials('MEMBER');
    if (member) {
      await login(page, member, '/arena');
      await audit(page, '/arena');
      await audit(page, '/account');
    }
    expect(problems).toEqual([]);
  });

  test('keyboard reaches primary actions on the arena', async ({ page }) => {
    const member = credentials('MEMBER');
    test.skip(!member, 'No MEMBER credentials');
    await login(page, member!, '/arena');
    await waitForArena(page);
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const label = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el ? `${el.id}|${el.getAttribute('aria-label') ?? ''}|${el.textContent?.trim() ?? ''}` : '';
      });
      seen.add(label);
    }
    const all = [...seen].join('\n');
    expect(all).toContain('theme-toggle-btn');
    expect(all).toMatch(/Account menu/);
    // Either a quest claim button or (all claimed) a workout start button is reachable.
    expect(all).toMatch(/Lock in:|Start session:/);
  });
});
