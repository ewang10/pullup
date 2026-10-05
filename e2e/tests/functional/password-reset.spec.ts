/** Forgot password: the emailed link lets the user set a new password. */
import { expect, test } from '@playwright/test';
import { createUser, latestEmailTo, signedIn, uniqueName } from './supabase';

test('reset a forgotten password from the emailed link', async ({ page }) => {
  const user = await createUser('venue_admin', uniqueName('Owner'));

  await page.goto('/reset-password');
  await page.getByLabel('Email address').fill(user.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('Check your email for a password reset link.')).toBeVisible();

  const mail = await latestEmailTo(user.email);
  const link = mail.html.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
  expect(link, 'reset link in the email').toBeTruthy();

  await page.goto(link!);
  await page.waitForURL(/\/reset-password/);
  const newPassword = 'Changed-Pass2!';
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password').fill(newPassword);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText('Password updated successfully.', { exact: false })).toBeVisible();

  await expect(signedIn(user.email, newPassword)).resolves.toBeTruthy();
  await expect(signedIn(user.email)).rejects.toThrow(/Sign-in failed/);
});
