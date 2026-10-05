/** Staff review drivers; admins also suspend, extend deadlines and manage the team. */
import { expect, test, type Page } from '@playwright/test';
import { signIn } from '../helpers';
import { admin, latestEmailTo, uniqueName } from './supabase';

function driverCard(page: Page, name: string) {
  return page.getByRole('listitem').filter({ has: page.getByRole('heading', { name, level: 2 }) });
}

test('support staff approve and reject driver applications', async ({ page }) => {
  await signIn(page, 'pullup staff');
  await page.waitForURL(/\/staff\/drivers/);

  await driverCard(page, 'Carlos Mendoza').getByRole('button', { name: 'Approve driver' }).click();
  await expect(page.getByText('Carlos Mendoza approved.')).toBeFocused();

  const tanya = driverCard(page, 'Tanya Brooks');
  await tanya.getByRole('button', { name: 'Reject…' }).click();
  await tanya.getByRole('button', { name: 'Reject driver' }).click();
  // The error is focused so screen readers announce it, and the earlier success message is cleared.
  await expect(page.getByText('Add a reason. The driver will see it in the app.')).toBeFocused();
  await expect(page.getByText('Carlos Mendoza approved.')).toHaveCount(0);
  await tanya.getByLabel('Reason shown to the driver').fill('Driver ID does not match the photo.');
  await tanya.getByRole('button', { name: 'Reject driver' }).click();
  await expect(page.getByText('Tanya Brooks rejected.')).toBeVisible();

  // Support can't suspend approved drivers.
  await page.getByRole('button', { name: 'Approved', exact: true }).click();
  await expect(driverCard(page, 'Carlos Mendoza')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suspend…' })).toHaveCount(0);

  const { data: events } = await admin
    .from('driver_review_events')
    .select('action, note, actor_role')
    .order('created_at', { ascending: false })
    .limit(2);
  expect(events).toEqual([
    { action: 'rejected', note: 'Driver ID does not match the photo.', actor_role: 'platform_support' },
    { action: 'approved', note: null, actor_role: 'platform_support' },
  ]);
});

test('admins suspend with a payout hold and reinstate', async ({ page }) => {
  await signIn(page, 'pullup admin');
  await page.waitForURL(/\/staff\/drivers/);
  await page.getByRole('button', { name: 'Approved', exact: true }).click();

  const driver = driverCard(page, 'Demo Driver');
  await driver.getByRole('button', { name: 'Suspend…' }).click();
  await driver.getByLabel('Reason shown to the driver').fill('Automated test suspension.');
  await driver.getByRole('checkbox', { name: /Hold unpaid bonuses/ }).check();
  await driver.getByRole('button', { name: 'Suspend driver' }).click();
  await expect(page.getByText('Demo Driver suspended.')).toBeVisible();

  const { data: user } = await admin.from('users').select('id').eq('email', 'pullup.demo.app+driver@gmail.com').single();
  const profile = async () =>
    (await admin.from('driver_profiles').select('verification_status, payouts_on_hold').eq('user_id', user!.id).single()).data;
  expect(await profile()).toEqual({ verification_status: 'suspended', payouts_on_hold: true });

  await page.getByRole('button', { name: 'Suspended', exact: true }).click();
  await driverCard(page, 'Demo Driver').getByRole('button', { name: 'Reinstate driver' }).click();
  await expect(page.getByText('Demo Driver reinstated.')).toBeVisible();
  expect(await profile()).toEqual({ verification_status: 'approved', payouts_on_hold: false });
});

test('admins extend a receipt deadline', async ({ page }) => {
  await signIn(page, 'pullup admin');
  await page.waitForURL(/\/staff\/drivers/);
  await page.goto('/staff/receipts');
  const waiting = page.getByRole('region', { name: 'Waiting on riders' });
  const extend = waiting.getByRole('button', { name: 'Extend 7 days' }).first();
  await extend.click();
  await expect(page.getByText(/^Gave .+ until /)).toBeVisible();
});

test('admins invite a team member, who gets an email, then remove them', async ({ page }) => {
  await signIn(page, 'pullup admin');
  await page.waitForURL(/\/staff\/drivers/);
  await page.goto('/staff/team');

  const name = uniqueName('Teammate');
  const email = `${name.toLowerCase()}@pullup.test`;
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Work email').fill(email);
  await page.getByRole('radio', { name: 'Support' }).check();
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText(`Invitation sent to ${email}.`, { exact: false })).toBeVisible();

  const mail = await latestEmailTo(email);
  expect(mail.html).toContain('/auth/v1/verify');
  const { data: member } = await admin.from('users').select('role').eq('email', email).single();
  expect(member!.role).toBe('platform_support');

  await page.getByRole('button', { name: `Remove ${name} from the team` }).click();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page.getByText(`${name} was removed from the team.`)).toBeVisible();
});
