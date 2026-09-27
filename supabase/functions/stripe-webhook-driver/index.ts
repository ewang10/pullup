import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@14.0.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  if (!sig) {
    return new Response(JSON.stringify({ error: 'Missing stripe-signature header' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      Deno.env.get('STRIPE_WEBHOOK_SECRET_DRIVER')!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook signature verification failed';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (event.type !== 'payout.failed') {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const adminSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // event.account is the connected account that owns this payout
  const connectedAccountId = (event as any).account as string;
  const payout = event.data.object as Stripe.Payout;
  const failureMessage = payout.failure_message ?? 'Payout failed. Please update your payout method.';

  // Find the driver by their connected Stripe account
  const { data: profile } = await adminSupabase
    .from('driver_profiles')
    .select('id, user_id')
    .eq('stripe_account_id', connectedAccountId)
    .single();

  if (!profile) {
    return new Response(JSON.stringify({ error: 'Driver profile not found for account' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Find the most recent completed cashout for this driver
  const { data: tx } = await adminSupabase
    .from('driver_transactions')
    .select('id, amount')
    .eq('user_id', profile.user_id)
    .eq('type', 'cashout')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!tx) {
    return new Response(JSON.stringify({ error: 'No completed cashout found to fail' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Mark the cashout as failed
  await adminSupabase
    .from('driver_transactions')
    .update({ status: 'failed', failure_reason: failureMessage })
    .eq('id', tx.id);

  // Restore payout balance by resetting only the claims paid in this specific cashout.
  await adminSupabase
    .from('deal_claims')
    .update({ driver_kickback_paid: false, driver_transaction_id: null })
    .eq('driver_transaction_id', tx.id);

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
