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

    // Get rider profile
    const { data: profile, error: profileError } = await adminSupabase
      .from('rider_profiles')
      .select('id, balance, stripe_account_id, stripe_onboarding_complete')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Rider profile not found' }), {
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

    // Atomically claim the balance — locks the row so concurrent calls cannot
    // both read the same nonzero balance (race condition prevention).
    const { data: claimedBalance, error: claimErr } = await adminSupabase
      .rpc('claim_rider_cashout_balance', { p_rider_profile_id: profile.id });

    if (claimErr || !claimedBalance || claimedBalance <= 0) {
      return new Response(JSON.stringify({ error: 'No balance available to cash out' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const amountCents = Math.round(claimedBalance * 100);
    const amountDollars = claimedBalance;

    try {
      // Create Stripe Transfer from platform to rider's connected account
      // Balance already zeroed atomically — proceed directly to Stripe transfer
      const transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: 'usd',
        destination: profile.stripe_account_id,
        metadata: {
          user_id: user.id,
          rider_profile_id: profile.id,
          type: 'rider_cashout',
        },
      });

      // Record the cashout transaction
      await adminSupabase
        .from('rider_transactions')
        .insert({
          user_id: user.id,
          type: 'cashout',
          amount: amountDollars,
          status: 'completed',
          stripe_transfer_id: transfer.id,
        });

      return new Response(JSON.stringify({
        message: 'Cashout successful',
        amount: amountDollars,
        transfer_id: transfer.id,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (stripeErr) {
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
