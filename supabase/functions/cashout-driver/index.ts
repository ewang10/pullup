import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@14.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'Stripe is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get driver profile
    const { data: profile, error: profileError } = await adminSupabase
      .from('driver_profiles')
      .select('id, stripe_account_id, stripe_onboarding_complete')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Driver profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!profile.stripe_onboarding_complete) {
      return new Response(JSON.stringify({ error: 'Please complete Stripe onboarding before cashing out' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!profile.stripe_account_id) {
      return new Response(JSON.stringify({ error: 'No Stripe account connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Acquire cashout lock — prevents double cashout race condition.
    // Only proceeds if cashout_in_progress was false (atomic update with eq filter).
    // Returns the updated row if the lock was acquired (empty array = already locked).
    const { data: lockResult } = await adminSupabase
      .from('driver_profiles')
      .update({ cashout_in_progress: true })
      .eq('id', profile.id)
      .eq('cashout_in_progress', false)
      .select('id');

    if (!lockResult || lockResult.length === 0) {
      return new Response(JSON.stringify({ error: 'A cashout is already in progress' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get payout balance via get_driver_stats() RPC (uses admin client scoped to driver's uid)
    // We use a user-scoped client to call the RPC so auth.uid() resolves correctly
    const { data: statsData, error: statsError } = await supabase.rpc('get_driver_stats');
    if (statsError || !statsData) {
      await adminSupabase
        .from('driver_profiles')
        .update({ cashout_in_progress: false })
        .eq('id', profile.id);

      return new Response(JSON.stringify({ error: 'Could not retrieve driver stats' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stats = Array.isArray(statsData) ? statsData[0] : statsData;
    const payoutBalance = Number(stats.payout_balance ?? 0);

    if (payoutBalance <= 0) {
      // Release lock before returning — no transfer will happen
      await adminSupabase
        .from('driver_profiles')
        .update({ cashout_in_progress: false })
        .eq('id', profile.id);

      return new Response(JSON.stringify({ error: 'No balance available to cash out' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const amountCents = Math.round(payoutBalance * 100);
    const amountDollars = payoutBalance;

    try {
      // Create Stripe Transfer from platform to driver's connected account
      const transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: 'usd',
        destination: profile.stripe_account_id,
        metadata: {
          user_id: user.id,
          driver_profile_id: profile.id,
          type: 'driver_cashout',
        },
      });

      // Record the cashout transaction first so we have its ID
      const { data: newTx } = await adminSupabase
        .from('driver_transactions')
        .insert({
          user_id: user.id,
          type: 'cashout',
          amount: amountDollars,
          status: 'completed',
          stripe_transfer_id: transfer.id,
        })
        .select('id')
        .single();

      // Mark all unpaid completed kickbacks as paid, stamping which cashout paid them
      await adminSupabase
        .from('deal_claims')
        .update({ driver_kickback_paid: true, driver_transaction_id: newTx!.id })
        .eq('referring_driver_id', profile.id)
        .eq('driver_kickback_paid', false)
        .eq('status', 'completed');

      // Release lock on success
      await adminSupabase
        .from('driver_profiles')
        .update({ cashout_in_progress: false })
        .eq('id', profile.id);

      return new Response(JSON.stringify({
        message: 'Cashout successful',
        amount: amountDollars,
        transfer_id: transfer.id,
        transaction_id: newTx!.id,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (stripeErr) {
      // Always release lock on failure
      await adminSupabase
        .from('driver_profiles')
        .update({ cashout_in_progress: false })
        .eq('id', profile.id);

      // Return actionable Stripe error messages
      const message = stripeErr instanceof Error ? stripeErr.message : 'Transfer failed';
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
