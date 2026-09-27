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

  const url = new URL(req.url);

  // Handle Stripe redirect (GET request after onboarding completes or needs refresh)
  if (req.method === 'GET' && (url.searchParams.has('complete') || url.searchParams.has('refresh'))) {
    const isComplete = url.searchParams.has('complete');

    // If onboarding completed, update the rider's profile
    if (isComplete) {
      try {
        const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
        const adminSupabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        if (stripeKey) {
          const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });

          // Find all rider profiles with a Stripe account but not yet marked complete
          const { data: profiles } = await adminSupabase
            .from('rider_profiles')
            .select('user_id, stripe_account_id')
            .eq('stripe_onboarding_complete', false)
            .not('stripe_account_id', 'is', null);

          // Check each account's status with Stripe
          for (const profile of (profiles ?? [])) {
            if (!profile.stripe_account_id) continue;
            try {
              const account = await stripe.accounts.retrieve(profile.stripe_account_id);
              if (account.details_submitted) {
                await adminSupabase
                  .from('rider_profiles')
                  .update({ stripe_onboarding_complete: true })
                  .eq('user_id', profile.user_id);
              }
            } catch {
              // Skip accounts that can't be retrieved
            }
          }
        }
      } catch {
        // Non-critical — the wallet screen will also check on next load
      }
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PullUp</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #F8F9FA; }
    .card { text-align: center; padding: 40px; max-width: 400px; }
    h1 { color: #6C63FF; font-size: 24px; margin-bottom: 8px; }
    p { color: #6B7280; font-size: 16px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${isComplete ? 'Setup Complete!' : 'Session Expired'}</h1>
    <p>${isComplete
      ? 'Your payout method has been set up. You can close this page and return to the PullUp app.'
      : 'Your session expired. Please go back to the PullUp app and try again.'}</p>
  </div>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Handle POST request (create account / onboarding link from mobile app)
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

    // Check if rider already has a Stripe account
    const { data: profile, error: profileError } = await adminSupabase
      .from('rider_profiles')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Rider profile not found', details: profileError?.message }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let accountId = profile.stripe_account_id;

    // Handle "manage" action — generate a Stripe Express dashboard login link
    let body: { action?: string } = {};
    try {
      body = await req.json();
    } catch {
      // No body or invalid JSON — default to onboarding flow
    }

    if (body.action === 'manage') {
      if (!accountId || !profile.stripe_onboarding_complete) {
        return new Response(JSON.stringify({ error: 'Stripe account not set up yet' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const loginLink = await stripe.accounts.createLoginLink(accountId);
      return new Response(JSON.stringify({ url: loginLink.url }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If account exists, check if onboarding is already done
    if (accountId && !profile.stripe_onboarding_complete) {
      const account = await stripe.accounts.retrieve(accountId);
      if (account.details_submitted) {
        await adminSupabase
          .from('rider_profiles')
          .update({ stripe_onboarding_complete: true })
          .eq('user_id', user.id);

        return new Response(JSON.stringify({
          message: 'Stripe onboarding already complete',
          already_complete: true,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Create a new Stripe Connect Express account if one doesn't exist
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: user.email,
        metadata: {
          user_id: user.id,
        },
        capabilities: {
          transfers: { requested: true },
        },
      });

      accountId = account.id;

      // Save the Stripe account ID
      await adminSupabase
        .from('rider_profiles')
        .update({ stripe_account_id: accountId })
        .eq('user_id', user.id);
    }

    // Create an account link for onboarding
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${supabaseUrl}/functions/v1/create-connect-account?refresh=true`,
      return_url: `${supabaseUrl}/functions/v1/create-connect-account?complete=true`,
      type: 'account_onboarding',
    });

    return new Response(JSON.stringify({
      url: accountLink.url,
      account_id: accountId,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
