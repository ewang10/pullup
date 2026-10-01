import { test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalScroll } from './helpers';

const PUBLIC_PAGES = [
  '/',
  '/how-it-works',
  '/faq',
  '/support',
  '/privacy',
  '/terms',
  '/mobile',
  '/login',
  '/signup',
  '/reset-password',
];

for (const path of PUBLIC_PAGES) {
  test(`public page ${path} meets WCAG 2.2 AA and reflows at 320px`, async ({ page }) => {
    await page.goto(path);
    await expectAccessible(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await expectNoHorizontalScroll(page);
  });
}
