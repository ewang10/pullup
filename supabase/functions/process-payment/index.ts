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
        event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        console.error('Webhook signature verification failed:', msg);
        return new Response(JSON.stringify({ error: 'Invalid signature', detail: msg }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Webhook event received:', event.type, event.id);

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

              // Re-activate deals that were paused due to a prior payment failure
              const { data: claimForVenue } = await supabase
                .from('deal_claims')
                .select('deal:deals(venue_id)')
                .eq('id', claimId)
                .single();
              const venueId = (claimForVenue?.deal as any)?.venue_id;
              if (venueId) {
                await supabase
                  .from('deals')
                  .update({ is_active: true })
                  .eq('venue_id', venueId)
                  .eq('is_active', false);

                await supabase
                  .from('venues')
                  .update({ payment_suspended: false })
                  .eq('id', venueId);
              }
            }
          }
          break;
        }

        case 'payment_intent.processing': {
          // ACH debit is processing — status stays 'pending' in DB until succeeded fires
          const pi = event.data.object as Stripe.PaymentIntent;
          console.log('ACH payment processing for claim', pi.metadata.claim_id, pi.id);
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          const claimId = paymentIntent.metadata.claim_id;
          const txnType = paymentIntent.metadata.transaction_type;

          if (claimId && txnType === 'venue_charge') {
            // 1. Mark transaction failed
            await supabase
              .from('transactions')
              .update({
                status: 'failed',
                stripe_payment_id: paymentIntent.id,
              })
              .eq('deal_claim_id', claimId)
              .eq('type', 'venue_charge');

            // 2. Find venue via claim → deal → venue
            const { data: claim } = await supabase
              .from('deal_claims')
              .select('deal:deals(venue_id, venue:venues(id, owner_user_id, name))')
              .eq('id', claimId)
              .single();

            const venue = (claim?.deal as any)?.venue;
            if (venue) {
              // 3. Suspend all deals and flag the venue
              await supabase
                .from('deals')
                .update({ is_active: false })
                .eq('venue_id', venue.id);

              await supabase
                .from('venues')
                .update({ payment_suspended: true })
                .eq('id', venue.id);

              // 4. Email venue owner (fire-and-forget)
              const resendKey = Deno.env.get('RESEND_API_KEY');
              const fromEmail = Deno.env.get('RESEND_FROM_EMAIL');
              if (resendKey && fromEmail) {
                const { data: { user: ownerUser } } = await supabase.auth.admin.getUserById(venue.owner_user_id);
                if (ownerUser?.email) {
                  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? 'https://your-app.com';
                  await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${resendKey}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      from: `PullUp <${fromEmail}>`,
                      to: ownerUser.email,
                      subject: `Action required: Payment failed for ${venue.name}`,
                      html: `<p>Hi,</p>
                        <p>A payment of <strong>$${(paymentIntent.amount / 100).toFixed(2)}</strong> for your venue
                        <strong>${venue.name}</strong> failed to process. Your active deals have been paused
                        to prevent new charges from accruing.</p>
                        <p>Please <a href="${appUrl}/billing">retry the payment</a> or update your bank account.</p>
                        <p>— PullUp Team</p>`,
                    }),
                  }).catch(e => console.warn('Email send failed:', e));
                }
              } else {
                console.warn('RESEND_API_KEY or RESEND_FROM_EMAIL not set — skipping email notification');
              }
            }
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

        case 'account.updated': {
          // Stripe Connect account onboarding completion
          const account = event.data.object as Stripe.Account;
          const userId = account.metadata?.user_id;

          if (userId && account.details_submitted) {
            // Update rider's Stripe onboarding status
            await supabase
              .from('rider_profiles')
              .update({ stripe_onboarding_complete: true })
              .eq('user_id', userId);
          }
          break;
        }

        case 'transfer.failed': {
          // Transfer to connected account failed — restore balance
          const failedTransfer = event.data.object as Stripe.Transfer;
          const riderUserId = failedTransfer.metadata?.user_id;
          const transferType = failedTransfer.metadata?.type;

          if (transferType === 'rider_cashout' && riderUserId) {
            // Restore the rider's balance
            const amountDollars = failedTransfer.amount / 100;
            await supabase.rpc('increment_rider_balance', {
              p_user_id: riderUserId,
              p_amount: amountDollars,
            });

            // Mark the rider_transaction as failed
            await supabase
              .from('rider_transactions')
              .update({
                status: 'failed',
                failure_reason: 'Transfer to your account failed. Please check your payout method.',
                updated_at: new Date().toISOString(),
              })
              .eq('stripe_transfer_id', failedTransfer.id);
          }

          // Also handle claim-level transfer failures
          const failClaimId = failedTransfer.metadata?.claim_id;
          const failTxnType = failedTransfer.metadata?.transaction_type;

          if (failClaimId && failTxnType) {
            await supabase
              .from('transactions')
              .update({
                status: 'failed',
                stripe_payment_id: failedTransfer.id,
              })
              .eq('deal_claim_id', failClaimId)
              .eq('type', failTxnType);
          }
          break;
        }

        case 'payout.failed': {
          // Payout from connected account to bank failed
          // This happens when the rider's bank account rejects the payout
          const payout = event.data.object as Stripe.Payout;
          const connectedAccountId = (event as any).account;

          if (connectedAccountId) {
            // Find the rider by their Stripe account ID and restore balance
            const { data: riderProfile } = await supabase
              .from('rider_profiles')
              .select('user_id')
              .eq('stripe_account_id', connectedAccountId)
              .single();

            if (riderProfile) {
              // Find all completed cashouts and mark them as failed, restoring each amount
              const failureReason = payout.failure_message
                || 'Payout to your bank failed. Please check your bank account details.';
              const { data: completedCashouts } = await supabase
                .from('rider_transactions')
                .select('id, amount')
                .eq('user_id', riderProfile.user_id)
                .eq('type', 'cashout')
                .eq('status', 'completed');

              let totalRestore = 0;
              for (const tx of (completedCashouts ?? [])) {
                totalRestore += Number(tx.amount);
                await supabase
                  .from('rider_transactions')
                  .update({
                    status: 'failed',
                    stripe_payout_id: payout.id,
                    failure_reason: failureReason,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', tx.id);
              }

              // Restore the total cashout amount, not the payout amount
              if (totalRestore > 0) {
                await supabase.rpc('increment_rider_balance', {
                  p_user_id: riderProfile.user_id,
                  p_amount: totalRestore,
                });
              }
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

    // Manual payment trigger: internal only. Anyone holding the public anon key
    // could reach this path, so require the service role key.
    const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!bearer || bearer !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

        if (!venue.stripe_payment_method_id) {
          return new Response(JSON.stringify({ error: 'Venue has no payment method on file' }), {
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
          payment_method: venue.stripe_payment_method_id,
          payment_method_types: ['us_bank_account'],
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
