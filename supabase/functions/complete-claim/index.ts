import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const authHeader = req.headers.get('Authorization');
    console.log('complete-claim auth header present:', !!authHeader);
    console.log('complete-claim auth header preview:', authHeader?.substring(0, 30));

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('complete-claim getUser result:', { user: !!user, authError: authError?.message });
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', detail: authError?.message }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { venue_id, claim_id } = await req.json();

    if (!venue_id) {
      return new Response(JSON.stringify({ error: 'venue_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the rider's active claim at this venue
    let query = supabase
      .from('deal_claims')
      .select('*, deal:deals(*, venue:venues(*))')
      .eq('rider_user_id', user.id)
      .eq('status', 'reserved');

    if (claim_id) {
      query = query.eq('id', claim_id);
    }

    const { data: claims, error: claimError } = await query;

    if (claimError || !claims || claims.length === 0) {
      return new Response(JSON.stringify({ error: 'No active claim found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find a claim matching this venue
    const claim = claims.find((c: any) => c.deal?.venue_id === venue_id);

    if (!claim) {
      return new Response(JSON.stringify({ error: 'No active claim found for this venue' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role for all status mutations — the rider-level trigger
    // blocks direct status changes from the anon/user client.
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check if claim has expired
    if (new Date(claim.expires_at) < new Date()) {
      await adminSupabase
        .from('deal_claims')
        .update({ status: 'expired' })
        .eq('id', claim.id);

      return new Response(JSON.stringify({ error: 'Claim has expired' }), {
        status: 410,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark claim as completed
    const now = new Date().toISOString();
    const { data: updatedClaim, error: updateError } = await adminSupabase
      .from('deal_claims')
      .update({
        status: 'completed',
        completed_at: now,
      })
      .eq('id', claim.id)
      .select('*, deal:deals(*, venue:venues(*))')
      .single();

    if (updateError) {
      return new Response(JSON.stringify({ error: 'Failed to complete claim' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const deal = claim.deal;

    // Determine whether any receipt is required.
    // When no receipt is required, settle everything immediately.
    // When any receipt is required, all transactions stay pending until
    // verify-receipt confirms all required receipts are approved.
    const requiresAnyReceipt = deal.requires_ride_receipt || deal.requires_venue_receipt;
    const txStatus = requiresAnyReceipt ? 'pending' : 'completed';

    const transactions = [
      {
        deal_claim_id: claim.id,
        type: 'venue_charge',
        amount: deal.ride_credit_amount + deal.driver_kickback_amount + deal.platform_fee_amount,
        status: txStatus,
      },
      {
        deal_claim_id: claim.id,
        type: 'ride_reimbursement',
        amount: deal.ride_credit_amount,
        status: txStatus,
      },
      {
        deal_claim_id: claim.id,
        type: 'platform_fee',
        amount: deal.platform_fee_amount,
        status: txStatus,
      },
    ];

    // Add driver kickback transaction if there's a referring driver.
    if (claim.referring_driver_id) {
      transactions.push({
        deal_claim_id: claim.id,
        type: 'driver_kickback',
        amount: deal.driver_kickback_amount,
        status: txStatus,
      });
    }

    await adminSupabase.from('transactions').insert(transactions);

    // If no receipts required: settle immediately — increment balances and mark flags.
    // This also fixes the pre-existing issue where driver earnings were never incremented
    // unless the rider uploaded a receipt.
    if (!requiresAnyReceipt) {
      await adminSupabase.rpc('increment_rider_balance', {
        p_user_id: claim.rider_user_id,
        p_amount: deal.ride_credit_amount,
      });

      if (claim.referring_driver_id) {
        await adminSupabase.rpc('increment_driver_earnings', {
          p_driver_id: claim.referring_driver_id,
          p_amount: deal.driver_kickback_amount,
        });
      }

      await adminSupabase
        .from('deal_claims')
        .update({
          ride_credit_paid: true,
          venue_charged: true,
        })
        .eq('id', claim.id);
    }

    const message = requiresAnyReceipt
      ? 'Deal completed! Upload your receipt(s) to receive your ride credit.'
      : 'Deal completed! Your ride credit has been added to your wallet.';

    return new Response(JSON.stringify({
      claim: updatedClaim,
      message,
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
