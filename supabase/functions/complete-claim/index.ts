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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
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

    // Check if claim has expired
    if (new Date(claim.expires_at) < new Date()) {
      await supabase
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
    const { data: updatedClaim, error: updateError } = await supabase
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

    // Create pending transactions using service role for admin operations
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const deal = claim.deal;
    const transactions = [
      {
        deal_claim_id: claim.id,
        type: 'venue_charge',
        amount: deal.ride_credit_amount + deal.driver_kickback_amount + deal.platform_fee_amount,
        status: 'pending',
      },
      {
        deal_claim_id: claim.id,
        type: 'ride_reimbursement',
        amount: deal.ride_credit_amount,
        status: 'pending',
      },
      {
        deal_claim_id: claim.id,
        type: 'platform_fee',
        amount: deal.platform_fee_amount,
        status: 'pending',
      },
    ];

    // Add driver kickback transaction if there's a referring driver
    if (claim.referring_driver_id) {
      transactions.push({
        deal_claim_id: claim.id,
        type: 'driver_kickback',
        amount: deal.driver_kickback_amount,
        status: 'pending',
      });
    }

    await adminSupabase.from('transactions').insert(transactions);

    return new Response(JSON.stringify({
      claim: updatedClaim,
      message: 'Deal completed! Upload your ride receipt to get your ride credit.',
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
