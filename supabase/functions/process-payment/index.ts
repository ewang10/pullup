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
    // This endpoint handles Stripe webhook events
    const sig = req.headers.get('stripe-signature');
    const body = await req.text();

    if (sig) {
      // Webhook from Stripe
      const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          const claimId = paymentIntent.metadata.claim_id;
          const txnType = paymentIntent.metadata.transaction_type;

          if (claimId && txnType) {
            await supabase
              .from('transactions')
              .update({
                status: 'completed',
                stripe_payment_id: paymentIntent.id,
              })
              .eq('deal_claim_id', claimId)
              .eq('type', txnType);

            if (txnType === 'venue_charge') {
              await supabase
                .from('deal_claims')
                .update({ venue_charged: true })
                .eq('id', claimId);
            }
          }
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          const claimId = paymentIntent.metadata.claim_id;
          const txnType = paymentIntent.metadata.transaction_type;

          if (claimId && txnType) {
            await supabase
              .from('transactions')
              .update({
                status: 'failed',
                stripe_payment_id: paymentIntent.id,
              })
              .eq('deal_claim_id', claimId)
              .eq('type', txnType);
          }
          break;
        }

        case 'transfer.created': {
          // Driver payout or rider reimbursement transfer created
          const transfer = event.data.object as Stripe.Transfer;
          const claimId = transfer.metadata.claim_id;
          const txnType = transfer.metadata.transaction_type;

          if (claimId && txnType) {
            await supabase
              .from('transactions')
              .update({
                status: 'completed',
                stripe_payment_id: transfer.id,
              })
              .eq('deal_claim_id', claimId)
              .eq('type', txnType);

            if (txnType === 'driver_kickback') {
              await supabase
                .from('deal_claims')
                .update({ driver_kickback_paid: true })
                .eq('id', claimId);
            } else if (txnType === 'ride_reimbursement') {
              await supabase
                .from('deal_claims')
                .update({ ride_credit_paid: true })
                .eq('id', claimId);
            }
          }
          break;
        }
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Manual payment trigger (called from admin or after receipt verification)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { claim_id, action } = JSON.parse(body);

    if (!claim_id || !action) {
      return new Response(JSON.stringify({ error: 'claim_id and action required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: claim, error: claimError } = await supabase
      .from('deal_claims')
      .select('*, deal:deals(*, venue:venues(*)), rider:users!rider_user_id(*)')
      .eq('id', claim_id)
      .single();

    if (claimError || !claim) {
      return new Response(JSON.stringify({ error: 'Claim not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    switch (action) {
      case 'charge_venue': {
        // Charge venue's Stripe customer
        const venue = claim.deal.venue;
        if (!venue.stripe_customer_id) {
          return new Response(JSON.stringify({ error: 'Venue has no payment method' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const totalCharge = claim.deal.ride_credit_amount +
          claim.deal.driver_kickback_amount +
          claim.deal.platform_fee_amount;

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(totalCharge * 100), // Convert to cents
          currency: 'usd',
          customer: venue.stripe_customer_id,
          metadata: {
            claim_id: claim.id,
            transaction_type: 'venue_charge',
          },
          confirm: true,
          off_session: true,
        });

        return new Response(JSON.stringify({ payment_intent_id: paymentIntent.id }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'reimburse_rider': {
        // Transfer ride credit to rider (requires rider to have Stripe Connect)
        // For v1, this could be tracked as app credit instead
        return new Response(JSON.stringify({
          message: 'Rider reimbursement queued',
          amount: claim.deal.ride_credit_amount,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'pay_driver': {
        if (!claim.referring_driver_id) {
          return new Response(JSON.stringify({ error: 'No referring driver' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: driver } = await supabase
          .from('driver_profiles')
          .select('stripe_account_id')
          .eq('id', claim.referring_driver_id)
          .single();

        if (!driver?.stripe_account_id) {
          return new Response(JSON.stringify({ error: 'Driver has no Stripe account' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const transfer = await stripe.transfers.create({
          amount: Math.round(claim.deal.driver_kickback_amount * 100),
          currency: 'usd',
          destination: driver.stripe_account_id,
          metadata: {
            claim_id: claim.id,
            transaction_type: 'driver_kickback',
          },
        });

        return new Response(JSON.stringify({ transfer_id: transfer.id }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
