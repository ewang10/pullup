/** Venue owners manage deals, their profile and billing on the website. */
import { expect, test } from '@playwright/test';
import { expectAccessible, signIn } from '../helpers';
import { admin, invoke, signedIn, uniqueName } from './supabase';

const DEMO_PASSWORD = process.env.CI_DEMO_PASSWORD ?? '';

test.beforeEach(async ({ page }) => {
  await signIn(page, 'venue owner');
  await page.waitForURL(/\/dashboard/);
});

test('create, edit, pause and delete a deal', async ({ page }) => {
  const title = uniqueName('E2E deal ');
  await page.goto('/deals/new');
  await page.getByLabel('Deal title').fill(title);
  await page.getByLabel('Discount value').fill('15');
  await page.getByLabel('What you pay per completed visit ($)').fill('12');
  await page.getByRole('checkbox', { name: /Ride receipt/ }).check();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Create deal' }).click();
  await page.waitForURL(/\/deals$/);
  await expect(page.getByRole('rowheader', { name: new RegExp(title) })).toBeVisible();

  // Saved with PullUp's split of the cost per visit.
  const { data: saved } = await admin
    .from('deals')
    .select('id, ride_credit_amount, driver_kickback_amount, platform_fee_amount, requires_ride_receipt, is_active')
    .eq('title', title)
    .single();
  expect(saved).toMatchObject({
    ride_credit_amount: 6,
    driver_kickback_amount: 2.4,
    platform_fee_amount: 3.6,
    requires_ride_receipt: true,
    is_active: true,
  });

  // Riders can see it.
  const rider = await signedIn('pullup.demo.app+rider@gmail.com', DEMO_PASSWORD);
  const { data: visible } = await rider.from('deals').select('id').eq('id', saved!.id);
  expect(visible).toHaveLength(1);

  // Edit.
  const edited = `${title} (edited)`;
  await page.getByRole('link', { name: `Edit ${title}` }).click();
  await page.getByLabel('Deal title').fill(edited);
  await page.getByRole('button', { name: 'Update deal' }).click();
  await page.waitForURL(/\/deals$/);
  await expect(page.getByRole('rowheader', { name: new RegExp(edited.replace(/[()]/g, '\\$&')) })).toBeVisible();

  // Pause.
  await page.getByRole('button', { name: `Deactivate ${edited}` }).click();
  await expect(page.getByText(`"${edited}" is now hidden from riders.`)).toBeFocused();
  const { data: hidden } = await rider.from('deals').select('id').eq('id', saved!.id);
  expect(hidden, 'riders no longer see a paused deal').toHaveLength(0);

  // Delete (confirm dialog).
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: `Delete ${edited}` }).click();
  await expect(page.getByText(`"${edited}" was deleted.`)).toBeVisible();
  const { data: gone } = await admin.from('deals').select('id').eq('id', saved!.id);
  expect(gone).toHaveLength(0);
});

test('the deal form rejects a cost below the minimum', async ({ page }) => {
  await page.goto('/deals/new');
  await page.getByLabel('Deal title').fill(uniqueName('Too cheap '));
  await page.getByLabel('What you pay per completed visit ($)').fill('5');
  await expect(page.getByText(/Must be at least \$10\.00/)).toBeVisible();
});

test('update the venue profile', async ({ page }) => {
  await page.goto('/settings');
  const address = `${Date.now() % 1000} Test Street`;
  await page.getByLabel('Address').fill(address);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Venue profile updated successfully.')).toBeVisible();
  const { data } = await admin.from('venues').select('address').eq('name', 'Demo Café').single();
  expect(data!.address).toBe(address);
});

test('billing starts Stripe bank linking (test mode)', async () => {
  // The bank form itself is Stripe's page; check PullUp gets a SetupIntent from Stripe.
  const owner = await signedIn('pullup.demo.app@gmail.com', DEMO_PASSWORD);
  const res = await invoke<{ client_secret: string }>(owner, 'setup-venue-billing', {});
  expect(res.error).toBeNull();
  expect(res.data!.client_secret).toMatch(/^seti_.+_secret_/);
});
