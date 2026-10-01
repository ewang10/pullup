/**
 * Each role can reach its own area and is turned away from everyone else's.
 * The database rules are tested separately in supabase/tests.
 */
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const UNAUTHORIZED = /Riders and drivers use the mobile app/;
const VENUE_PAGES = ['/dashboard', '/deals', '/analytics', '/billing', '/qr-code', '/settings'];
const STAFF_PAGES = ['/staff/drivers', '/staff/receipts', '/staff/venues'];

test.describe('signed out', () => {
  for (const path of [...VENUE_PAGES, ...STAFF_PAGES, '/staff/team']) {
    test(`${path} sends visitors to sign in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

test('riders cannot use the website', async ({ page }) => {
  // Demo accounts share one password, so fill in staff and swap the email.
  await signIn(page, 'pullup staff', 'pullup.demo.app+rider@gmail.com');
  await expect(page.locator('#login-error')).toHaveText(UNAUTHORIZED);
  // The login page signs riders straight back out, so protected pages send them to sign in.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/staff/drivers');
  await expect(page).toHaveURL(/\/login/);
});

test('venue owners reach their dashboard but not staff pages', async ({ page }) => {
  await signIn(page, 'venue owner');
  await expect(page).toHaveURL(/\/dashboard/);
  for (const path of VENUE_PAGES) {
    await page.goto(path);
    await expect(page, path).toHaveURL(new RegExp(path));
  }
  // Signed-in users who open someone else's area land back on their own home.
  for (const path of [...STAFF_PAGES, '/staff/team']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/dashboard/);
  }
});

test('support staff reach reviews but not venue pages or team management', async ({ page }) => {
  await signIn(page, 'pullup staff');
  await expect(page).toHaveURL(/\/staff\/drivers/);
  for (const path of STAFF_PAGES) {
    await page.goto(path);
    await expect(page, path).toHaveURL(new RegExp(path));
  }
  await page.goto('/staff/team');
  await expect(page).toHaveURL(/\/staff\/drivers/);
  await expect(page.getByRole('link', { name: 'Team' })).toHaveCount(0);
  for (const path of VENUE_PAGES) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/staff\/drivers/);
  }
});

test('admins can manage the team', async ({ page }) => {
  await signIn(page, 'pullup admin');
  await expect(page).toHaveURL(/\/staff\/drivers/);
  await page.goto('/staff/team');
  await expect(page).toHaveURL(/\/staff\/team/);
  await expect(page.getByRole('heading', { name: 'Team', level: 1 })).toBeVisible();
});
