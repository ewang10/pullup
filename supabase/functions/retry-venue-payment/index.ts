import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@14.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    );

    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse body
    const body = await req.json().catch(() => ({}));
    const { transaction_id } = body;
    if (!transaction_id) {
      return new Response(JSON.stringify({ error: 'transaction_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Fetch transaction — must be venue_charge and failed
    const { data: txn, error: txnError } = await adminSupabase
      .from('transactions')
      .select('id, amount, status, type, deal_claim_id')
      .eq('id', transaction_id)
      .single();

    if (txnError || !txn) {
      return new Response(JSON.stringify({ error: 'Transaction not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (txn.type !== 'venue_charge') {
      return new Response(JSON.stringify({ error: 'Only venue_charge transactions can be retried' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (txn.status === 'pending') {
      return new Response(JSON.stringify({ error: 'A retry is already in progress' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (txn.status !== 'failed') {
      return new Response(JSON.stringify({ error: 'Only failed transactions can be retried' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Trace claim → deal → venue
    const { data: claim } = await adminSupabase
      .from('deal_claims')
      .select('deal:deals(venue_id, venue:venues(id, owner_user_id, stripe_customer_id, stripe_payment_method_id))')
      .eq('id', txn.deal_claim_id)
      .single();

    const venue = (claim?.deal as any)?.venue;
    if (!venue) {
      return new Response(JSON.stringify({ error: 'Venue not found for this transaction' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Verify ownership
    if (venue.owner_user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not authorized to retry this payment' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. Verify venue has payment method
    if (!venue.stripe_customer_id || !venue.stripe_payment_method_id) {
      return new Response(JSON.stringify({ error: 'Venue has no payment method on file. Please connect a bank account first.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 7. Reset transaction to pending
    await adminSupabase
      .from('transactions')
      .update({ status: 'pending', stripe_payment_id: null })
      .eq('id', txn.id);

    // 8. Create new PaymentIntent — rollback to 'failed' if Stripe rejects
    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(Number(txn.amount) * 100),
        currency: 'usd',
        customer: venue.stripe_customer_id,
        payment_method: venue.stripe_payment_method_id,
        payment_method_types: ['us_bank_account'],
        metadata: {
          claim_id: txn.deal_claim_id,
          transaction_type: 'venue_charge',
        },
        confirm: true,
        off_session: true,
      });
    } catch (stripeErr) {
      // Rollback: restore failed status so admin can retry again later
      await adminSupabase
        .from('transactions')
        .update({ status: 'failed' })
        .eq('id', txn.id);

      const msg = stripeErr instanceof Error ? stripeErr.message : 'Stripe error';
      console.error('Stripe PaymentIntent creation failed during retry:', msg);
      return new Response(JSON.stringify({ error: 'Failed to initiate payment retry' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      message: 'Retry initiated. Your deals will be reactivated automatically once the payment processes (1–4 business days).',
      payment_intent_id: paymentIntent.id,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
