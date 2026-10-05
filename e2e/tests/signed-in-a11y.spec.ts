/** Automated WCAG 2.2 AA checks on every signed-in page, per role. */
import { test } from '@playwright/test';
import { expectAccessible, signIn } from './helpers';

const AREAS = [
  {
    account: 'venue owner' as const,
    home: /\/dashboard/,
    pages: ['/dashboard', '/dashboard?denied=staff', '/deals', '/deals/new', '/analytics', '/billing', '/qr-code', '/settings'],
  },
  { account: 'pullup staff' as const, home: /\/staff\//, pages: ['/staff/drivers', '/staff/receipts', '/staff/venues'] },
  { account: 'pullup admin' as const, home: /\/staff\//, pages: ['/staff/team'] },
];

for (const { account, home, pages } of AREAS) {
  test(`${account} pages meet WCAG 2.2 AA`, async ({ page }) => {
    await signIn(page, account);
    await page.waitForURL(home);
    for (const path of pages) {
      await test.step(path, async () => {
        await page.goto(path);
        await expectAccessible(page);
      });
    }
  });
}
