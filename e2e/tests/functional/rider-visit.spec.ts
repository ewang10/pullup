/**
 * A rider's whole visit, through the same edge functions the mobile app
 * calls, then staff approving the receipts on the website, then the money
 * landing in the rider's wallet and the driver's earnings.
 */
import { expect, test } from '@playwright/test';
import { signIn } from '../helpers';
import { admin, createUser, invoke, RECEIPT_PNG, signedIn, uniqueName } from './supabase';

const DEMO_DRIVER_EMAIL = 'pullup.demo.app+driver@gmail.com';

async function dealByTitle(title: string) {
  const { data, error } = await admin
    .from('deals')
    .select('id, title, ride_credit_amount, driver_kickback_amount, platform_fee_amount, requires_ride_receipt, requires_venue_receipt')
    .eq('title', title)
    .single();
  if (error) throw error;
  return data;
}

async function demoDriver() {
  const { data: user } = await admin.from('users').select('id').eq('email', DEMO_DRIVER_EMAIL).single();
  const { data, error } = await admin
    .from('driver_profiles')
    .select('id, referral_code, payout_balance, verification_status')
    .eq('user_id', user!.id)
    .single();
  if (error) throw error;
  return data;
}

test('a rider claims, checks in, uploads receipts, and gets paid after staff approve', async ({ page }) => {
  // Both receipts required, so the full review path runs.
  const deal = await dealByTitle('20% off your bill');
  expect(deal.requires_ride_receipt && deal.requires_venue_receipt).toBe(true);
  const driverBefore = await demoDriver();
  expect(driverBefore.verification_status).toBe('approved');

  const name = uniqueName('Rider');
  const rider = await createUser('rider', name);
  const app = await signedIn(rider.email);

  // Claim.
  const claimed = await invoke<{ claim: { id: string; status: string } }>(app, 'claim-deal', { deal_id: deal.id });
  expect(claimed.error).toBeNull();
  const claimId = claimed.data!.claim.id;
  expect(claimed.data!.claim.status).toBe('reserved');

  const again = await invoke(app, 'claim-deal', { deal_id: deal.id });
  expect(again.error, 'a second claim on the same deal is refused').not.toBeNull();

  // Driver code (typed with lowercase and a dash, as a rider might).
  const code = driverBefore.referral_code as string;
  const typed = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();
  const badCode = await invoke(app, 'link-driver', { claim_id: claimId, referral_code: 'ZZZZZZZZ' });
  expect(badCode.error).not.toBeNull();
  for (const pattern of ['%', `${code.slice(0, 3)}%`, '________']) {
    const wildcard = await invoke(app, 'link-driver', { claim_id: claimId, referral_code: pattern });
    expect(wildcard.error, `wildcard code ${pattern}`).not.toBeNull();
  }
  const linked = await invoke(app, 'link-driver', { claim_id: claimId, referral_code: typed });
  expect(linked.error).toBeNull();

  // Receipts can't be uploaded before check-in.
  const early = await app.storage.from('receipts').upload(`receipts/${claimId}/ride-early.png`, RECEIPT_PNG, {
    contentType: 'image/png',
  });
  if (!early.error) {
    const { error } = await app
      .from('deal_claims')
      .update({ ride_receipt_url: `receipts/${claimId}/ride-early.png`, ride_receipt_status: 'pending_review' })
      .eq('id', claimId);
    expect(error?.message).toContain('after checking in');
  }

  // Check in with the typed venue code (the no-camera path).
  const wrong = await invoke(app, 'complete-claim', { claim_id: claimId, checkin_code: 'NOPE00' });
  expect(wrong.error).not.toBeNull();
  const checkedIn = await invoke<{ claim: { status: string } }>(app, 'complete-claim', {
    claim_id: claimId,
    checkin_code: 'cafe42',
  });
  expect(checkedIn.error).toBeNull();
  expect(checkedIn.data!.claim.status).toBe('completed');

  // Upload both receipts, as the app does.
  for (const type of ['ride', 'venue'] as const) {
    const path = `receipts/${claimId}/${type}-${Date.now()}.png`;
    const up = await app.storage.from('receipts').upload(path, RECEIPT_PNG, { contentType: 'image/png' });
    expect(up.error, `${type} upload`).toBeNull();
    const { error } = await app
      .from('deal_claims')
      .update({ [`${type}_receipt_url`]: path, [`${type}_receipt_status`]: 'pending_review' })
      .eq('id', claimId);
    expect(error, `${type} submit`).toBeNull();
  }

  // Not paid yet: receipts are waiting for review.
  const { data: pending } = await admin.from('rider_profiles').select('balance').eq('user_id', rider.id).single();
  expect(Number(pending!.balance)).toBe(0);

  // Staff approve both receipts on the website.
  await signIn(page, 'pullup staff');
  await page.waitForURL(/\/staff\//);
  await page.goto('/staff/receipts');
  const card = page.getByRole('listitem').filter({ hasText: name });
  await expect(card).toBeVisible();

  const venueSection = card.getByRole('region', { name: 'Venue receipt' });
  await venueSection.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Enter the bill total from the receipt before approving it.')).toBeVisible();
  await venueSection.getByLabel('Bill total on the receipt ($)').fill('48.50');
  await venueSection.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(`Venue receipt for ${name} approved`)).toBeFocused();

  await card.getByRole('region', { name: 'Ride receipt' }).getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(`Ride receipt for ${name} approved`)).toBeVisible();
  await expect(card).toHaveCount(0);

  // Money: rider credit, driver bonus, venue bill and settled transactions.
  const { data: claim } = await admin
    .from('deal_claims')
    .select('ride_credit_paid, venue_charged, venue_bill_amount, referring_driver_id')
    .eq('id', claimId)
    .single();
  expect(claim).toMatchObject({ ride_credit_paid: true, venue_charged: true, referring_driver_id: driverBefore.id });
  expect(Number(claim!.venue_bill_amount)).toBe(48.5);

  const { data: wallet } = await admin.from('rider_profiles').select('balance').eq('user_id', rider.id).single();
  expect(Number(wallet!.balance)).toBe(Number(deal.ride_credit_amount));

  const driverAfter = await demoDriver();
  expect(Number(driverAfter.payout_balance) - Number(driverBefore.payout_balance)).toBeCloseTo(
    Number(deal.driver_kickback_amount),
    2
  );

  const { data: txns } = await admin.from('transactions').select('type, amount, status').eq('deal_claim_id', claimId);
  const byType = Object.fromEntries((txns ?? []).map((t) => [t.type, t]));
  expect(Object.keys(byType).sort()).toEqual(['driver_kickback', 'platform_fee', 'ride_reimbursement', 'venue_charge']);
  expect((txns ?? []).every((t) => t.status === 'completed')).toBe(true);
  const total = Number(deal.ride_credit_amount) + Number(deal.driver_kickback_amount) + Number(deal.platform_fee_amount);
  expect(Number(byType.venue_charge.amount)).toBeCloseTo(total, 2);

  // Cash out needs Stripe payout setup first; the setup link comes from Stripe (test mode).
  const cashout = await invoke(app, 'cashout', {});
  expect(cashout.error).toContain('complete Stripe onboarding');
  const setup = await invoke<{ url: string }>(app, 'create-connect-account', {});
  expect(setup.error).toBeNull();
  expect(setup.data!.url).toMatch(/^https:\/\/connect\.stripe\.com\//);
});

test('a rider can cancel a claim, and a rejected receipt is not paid', async ({ page }) => {
  const deal = await dealByTitle('Free appetizer with any entrée');
  const name = uniqueName('Rider');
  const rider = await createUser('rider', name);
  const app = await signedIn(rider.email);

  // Cancel.
  const first = await invoke<{ claim: { id: string } }>(app, 'claim-deal', { deal_id: deal.id });
  expect(first.error).toBeNull();
  const cancelled = await invoke(app, 'cancel-claim', { claim_id: first.data!.claim.id });
  expect(cancelled.error).toBeNull();
  const { data: c1 } = await admin.from('deal_claims').select('status').eq('id', first.data!.claim.id).single();
  expect(c1!.status).toBe('cancelled');

  // Claim again, check in, upload a ride receipt, staff reject it.
  const second = await invoke<{ claim: { id: string } }>(app, 'claim-deal', { deal_id: deal.id });
  expect(second.error, 'claiming again after cancelling').toBeNull();
  const claimId = second.data!.claim.id;
  expect((await invoke(app, 'complete-claim', { claim_id: claimId, checkin_code: 'CAFE42' })).error).toBeNull();
  const path = `receipts/${claimId}/ride-${Date.now()}.png`;
  expect((await app.storage.from('receipts').upload(path, RECEIPT_PNG, { contentType: 'image/png' })).error).toBeNull();
  expect(
    (await app.from('deal_claims').update({ ride_receipt_url: path, ride_receipt_status: 'pending_review' }).eq('id', claimId))
      .error
  ).toBeNull();

  // Riders can't open another rider's receipt.
  const other = await signedIn((await createUser('rider', uniqueName('Other'))).email);
  const peek = await other.storage.from('receipts').download(path);
  expect(peek.error, "another rider downloading this receipt").not.toBeNull();

  await signIn(page, 'pullup staff');
  await page.waitForURL(/\/staff\//);
  await page.goto('/staff/receipts');
  const card = page.getByRole('listitem').filter({ hasText: name });
  await card.getByRole('region', { name: 'Ride receipt' }).getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText(`Ride receipt for ${name} rejected`)).toBeVisible();

  const { data: claim } = await admin
    .from('deal_claims')
    .select('ride_receipt_status, ride_credit_paid')
    .eq('id', claimId)
    .single();
  expect(claim).toMatchObject({ ride_receipt_status: 'rejected', ride_credit_paid: false });
  const { data: wallet } = await admin.from('rider_profiles').select('balance').eq('user_id', rider.id).single();
  expect(Number(wallet!.balance)).toBe(0);
});
