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

    // Check if user is admin (for v1, manual receipt verification)
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'venue_admin') {
      return new Response(JSON.stringify({ error: 'Only admins can verify receipts' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { claim_id, approved } = await req.json();

    if (!claim_id || typeof approved !== 'boolean') {
      return new Response(JSON.stringify({ error: 'claim_id and approved (boolean) are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get the claim
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

    if (!claim.ride_receipt_url) {
      return new Response(JSON.stringify({ error: 'No receipt uploaded for this claim' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update verification status
    const { error: updateError } = await adminSupabase
      .from('deal_claims')
      .update({
        ride_receipt_verified: approved,
        ride_credit_paid: approved, // In v1, mark as paid immediately on approval
      })
      .eq('id', claim_id);

    if (updateError) {
      return new Response(JSON.stringify({ error: 'Failed to update claim' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If approved, update the ride reimbursement transaction status
    if (approved) {
      await adminSupabase
        .from('transactions')
        .update({ status: 'completed' })
        .eq('deal_claim_id', claim_id)
        .eq('type', 'ride_reimbursement');

      // If there's a referring driver, update driver earnings
      if (claim.referring_driver_id) {
        await adminSupabase
          .from('deal_claims')
          .update({ driver_kickback_paid: true })
          .eq('id', claim_id);

        await adminSupabase
          .from('transactions')
          .update({ status: 'completed' })
          .eq('deal_claim_id', claim_id)
          .eq('type', 'driver_kickback');

        // Update driver earnings
        await adminSupabase.rpc('increment_driver_earnings', {
          p_driver_id: claim.referring_driver_id,
          p_amount: claim.deal.driver_kickback_amount,
        });
      }
    }

    return new Response(JSON.stringify({
      message: approved ? 'Receipt approved. Ride credit will be processed.' : 'Receipt rejected.',
      claim_id,
      approved,
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
