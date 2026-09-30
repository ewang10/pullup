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

    // Only platform admin or support may approve/reject receipts
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'platform_admin' && userData?.role !== 'platform_support') {
      return new Response(JSON.stringify({ error: 'Only platform admins can verify receipts' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { claim_id, approved, receipt_type } = await req.json();

    if (!claim_id || typeof approved !== 'boolean') {
      return new Response(JSON.stringify({ error: 'claim_id and approved (boolean) are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (receipt_type !== 'ride' && receipt_type !== 'venue') {
      return new Response(JSON.stringify({ error: 'receipt_type must be "ride" or "venue"' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch the claim with deal receipt requirement config
    const { data: claim, error: claimError } = await adminSupabase
      .from('deal_claims')
      .select('*, deal:deals(*)')
      .eq('id', claim_id)
      .eq('status', 'completed')
      .single();

    if (claimError || !claim) {
      return new Response(JSON.stringify({ error: 'Completed claim not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Visits past their receipt deadline are closed and never settle.
    if (claim.unverified_at) {
      return new Response(JSON.stringify({ error: 'This visit was closed because receipts were not approved by the deadline' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ensure the receipt being reviewed actually has an upload
    const receiptUrl = receipt_type === 'ride' ? claim.ride_receipt_url : claim.venue_receipt_url;
    if (!receiptUrl) {
      return new Response(JSON.stringify({ error: `No ${receipt_type} receipt uploaded for this claim` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (approved) {
      // Update the appropriate receipt status to approved
      const receiptUpdate = receipt_type === 'ride'
        ? { ride_receipt_status: 'approved', ride_receipt_verified: true }
        : { venue_receipt_status: 'approved' };

      await adminSupabase
        .from('deal_claims')
        .update(receiptUpdate)
        .eq('id', claim_id);

      // Re-fetch to get the latest status of both receipts before deciding to settle
      const { data: refreshed } = await adminSupabase
        .from('deal_claims')
        .select('*, deal:deals(*)')
        .eq('id', claim_id)
        .single();

      if (!refreshed) {
        return new Response(JSON.stringify({ error: 'Failed to refresh claim state' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if ALL required receipts are now approved
      const deal = refreshed.deal;
      const rideOk  = !deal.requires_ride_receipt  || refreshed.ride_receipt_status  === 'approved';
      const venueOk = !deal.requires_venue_receipt || refreshed.venue_receipt_status === 'approved';
      const shouldSettle = rideOk && venueOk;

      // Settle only once — idempotency guard via ride_credit_paid flag
      if (shouldSettle && !refreshed.ride_credit_paid) {
        // Mark financial transactions as completed
        await adminSupabase
          .from('transactions')
          .update({ status: 'completed' })
          .eq('deal_claim_id', claim_id)
          .in('type', ['venue_charge', 'ride_reimbursement', 'platform_fee']);

        // Credit the rider
        await adminSupabase.rpc('increment_rider_balance', {
          p_user_id: refreshed.rider_user_id,
          p_amount: deal.ride_credit_amount,
        });

        // Update claim payment flags
        await adminSupabase
          .from('deal_claims')
          .update({ ride_credit_paid: true, venue_charged: true })
          .eq('id', claim_id);

        // Settle driver kickback if applicable and not yet paid
        if (refreshed.referring_driver_id) {
          await adminSupabase
            .from('transactions')
            .update({ status: 'completed' })
            .eq('deal_claim_id', claim_id)
            .eq('type', 'driver_kickback');

          await adminSupabase.rpc('increment_driver_earnings', {
            p_driver_id: refreshed.referring_driver_id,
            p_amount: deal.driver_kickback_amount,
          });
        }
      }
    } else {
      // Reject: update only the relevant receipt status
      const rejectUpdate = receipt_type === 'ride'
        ? { ride_receipt_status: 'rejected' }
        : { venue_receipt_status: 'rejected' };

      await adminSupabase
        .from('deal_claims')
        .update(rejectUpdate)
        .eq('id', claim_id);
    }

    return new Response(JSON.stringify({
      message: approved ? 'Receipt approved.' : 'Receipt rejected.',
      claim_id,
      approved,
      receipt_type,
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
