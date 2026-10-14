import fs from 'node:fs';
import path from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';

export type Role = 'MEMBER' | 'CREATOR' | 'ADMIN';
export interface Credentials {
  email: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Credentials: E2E_<ROLE>_EMAIL/PASSWORD, or a JSON file at E2E_USERS_FILE.
// Specs that need an account skip when none is configured (CI without secrets).
// ---------------------------------------------------------------------------
let fileUsers: Partial<Record<Role, Credentials>> | null = null;
function loadFileUsers(): Partial<Record<Role, Credentials>> {
  if (fileUsers) return fileUsers;
  fileUsers = {};
  const file = process.env.E2E_USERS_FILE;
  if (file && fs.existsSync(file)) {
    try {
      fileUsers = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Record<Role, Credentials>>;
    } catch {
      fileUsers = {};
    }
  }
  return fileUsers;
}

export function credentials(role: Role): Credentials | null {
  const email = process.env[`E2E_${role}_EMAIL`];
  const password = process.env[`E2E_${role}_PASSWORD`];
  if (email && password) return { email, password };
  const fromFile = loadFileUsers()[role];
  return fromFile?.email && fromFile.password ? { email: fromFile.email, password: fromFile.password } : null;
}

/** Skips the current test when the role has no configured account. */
export function requireCredentials(role: Role): Credentials {
  const c = credentials(role);
  test.skip(!c, `No ${role} credentials (set E2E_USERS_FILE or E2E_${role}_EMAIL/PASSWORD)`);
  return c as Credentials;
}

// ---------------------------------------------------------------------------
// Viewports & screenshots
// ---------------------------------------------------------------------------
export const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
} as const;
export type ViewportName = keyof typeof VIEWPORTS;

export const SCREENSHOT_DIR = process.env.E2E_SCREENSHOT_DIR || path.join(__dirname, '..', 'test-results', 'screens');

export async function snap(page: Page, name: string, { fullPage = true }: { fullPage?: boolean } = {}) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  // Let entrance animations/fonts settle so screenshots are representative.
  await page.evaluate(() => document.fonts?.ready);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage, animations: 'disabled' });
}

// ---------------------------------------------------------------------------
// Page assertions
// ---------------------------------------------------------------------------
export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth, offenders } = await page.evaluate(() => {
    const vw = window.innerWidth;
    const wide = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > vw + 1;
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 80));
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth: vw, offenders: wide };
  });
  expect(scrollWidth, `horizontal overflow; widest elements: ${offenders.join(' | ')}`).toBeLessThanOrEqual(innerWidth);
}

/**
 * Header controls must not overlap each other or leave the viewport. (A
 * squeezed flex row overlaps instead of scrolling, so the scroll check alone
 * misses it.)
 */
export async function expectHeaderFits(page: Page) {
  const overlaps = await page.evaluate(() => {
    const items = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.site-header__inner > *:not(.site-header__start):not(.site-header__actions), .site-header__start > *, .site-header__actions > *',
      ),
    )
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0);
    const name = (el: HTMLElement) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}${el.id ? '#' + el.id : ''}`;
    const out: string[] = [];
    for (const { el, r } of items) {
      if (r.left < -1 || r.right > window.innerWidth + 1) out.push(`${name(el)} outside viewport`);
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i].r;
        const b = items[j].r;
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 1 && y > 1) out.push(`${name(items[i].el)} overlaps ${name(items[j].el)} by ${Math.round(x)}px`);
      }
    }
    return out;
  });
  expect(overlaps, 'header controls overlap').toEqual([]);
}

export async function expectSingleH1(page: Page) {
  await expect(page.locator('h1')).toHaveCount(1);
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
export async function login(page: Page, creds: Credentials, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  await page.locator('#login-email').fill(creds.email);
  await page.locator('#login-password').fill(creds.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
}

export async function signOut(page: Page) {
  await page.locator('.account-menu__trigger').click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/arena') && !url.pathname.startsWith('/account'));
}

/** Waits for the signed-in arena to finish loading its server data. */
export async function waitForArena(page: Page) {
  await expect(page.locator('#profile-name')).toBeVisible({ timeout: 20_000 });
}

// ---------------------------------------------------------------------------
// Diagnostics: every test fails on console errors, uncaught exceptions,
// failed requests and HTTP >= 400 responses, except 401s and anything the
// test explicitly allows (e.g. an intentional 409).
// ---------------------------------------------------------------------------
export interface Diagnostics {
  /** Allow problems whose text matches (e.g. /status of 409/). */
  allow: (pattern: RegExp) => void;
  problems: () => string[];
}

export const test = base.extend<{ diagnostics: Diagnostics }>({
  diagnostics: [
    async ({ page }, use, testInfo) => {
      const problems: string[] = [];
      const allowed: RegExp[] = [/status of 401/];
      const push = (msg: string) => {
        if (!allowed.some((re) => re.test(msg))) problems.push(msg);
      };

      page.on('console', (m) => {
        if (m.type() === 'error') push(`console.error: ${m.text()} @ ${m.location().url}`);
      });
      page.on('pageerror', (err) => push(`pageerror: ${err.message}`));
      page.on('requestfailed', (req) => {
        const failure = req.failure()?.errorText ?? '';
        // Navigations/prefetches cancelled by the browser are not errors.
        if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(failure)) return;
        push(`requestfailed: ${req.method()} ${req.url()} ${failure}`);
      });
      page.on('response', (res) => {
        const status = res.status();
        if (status >= 400 && status !== 401) push(`http ${status}: ${res.request().method()} ${res.url()} status of ${status}`);
      });

      const api: Diagnostics = {
        allow: (re) => {
          allowed.push(re);
        },
        problems: () => problems.filter((p) => !allowed.some((re) => re.test(p))),
      };
      await use(api);

      const remaining = api.problems();
      if (remaining.length) {
        await testInfo.attach('console-and-network-problems', { body: remaining.join('\n'), contentType: 'text/plain' });
      }
      expect(remaining, 'console errors / failed requests').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
