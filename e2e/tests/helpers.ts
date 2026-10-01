import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Wait until the page has finished loading data (no spinners left). */
export async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.locator('.animate-spin')).toHaveCount(0);
}

/** Fails with a readable list of WCAG violations on the current page. */
export async function expectAccessible(page: Page) {
  await settle(page);
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join('\n    ')}`
  );
  expect(summary, `Accessibility violations on ${page.url()}`).toEqual([]);
}

/** Content must reflow at 320 CSS px without horizontal scrolling (WCAG 1.4.10). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `Horizontal scroll on ${page.url()}`).toBeLessThanOrEqual(1);
}

type DemoAccount = 'venue owner' | 'pullup staff' | 'pullup admin';

/** Sign in with a demo account using the "Fill in … login" button on /login. */
export async function signIn(page: Page, account: DemoAccount, overrideEmail?: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: new RegExp(`fill in ${account} login`, 'i') }).click();
  if (overrideEmail) await page.getByLabel('Email address').fill(overrideEmail);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
