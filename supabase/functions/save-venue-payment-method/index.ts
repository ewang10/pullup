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

    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });

    // Authenticate caller
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

    // Parse body
    const body = await req.json().catch(() => ({}));
    const { setup_intent_id } = body;

    if (!setup_intent_id) {
      return new Response(JSON.stringify({ error: 'setup_intent_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch venue owned by this user
    const { data: venue, error: venueError } = await adminSupabase
      .from('venues')
      .select('id, stripe_customer_id')
      .eq('owner_user_id', user.id)
      .single();

    if (venueError || !venue) {
      return new Response(JSON.stringify({ error: 'Venue not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Retrieve SetupIntent from Stripe
    let setupIntent: Stripe.SetupIntent;
    try {
      setupIntent = await stripe.setupIntents.retrieve(setup_intent_id);
    } catch (stripeErr) {
      const message = stripeErr instanceof Error ? stripeErr.message : 'Invalid setup intent';
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (setupIntent.status !== 'succeeded') {
      return new Response(JSON.stringify({ error: 'SetupIntent has not succeeded' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the SetupIntent belongs to this venue's customer
    if (setupIntent.customer !== venue.stripe_customer_id) {
      return new Response(JSON.stringify({ error: 'SetupIntent does not belong to this venue' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Retrieve the payment method
    const paymentMethod = await stripe.paymentMethods.retrieve(
      setupIntent.payment_method as string
    );

    // Set as customer default payment method
    await stripe.customers.update(venue.stripe_customer_id, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    });

    // Save payment method details to venue
    const { error: updateError } = await adminSupabase
      .from('venues')
      .update({
        stripe_payment_method_id: paymentMethod.id,
        stripe_bank_last4: paymentMethod.us_bank_account?.last4 ?? null,
        stripe_bank_institution: paymentMethod.us_bank_account?.bank_name ?? null,
      })
      .eq('id', venue.id);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ message: 'Bank account saved' }), {
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
