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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { claim_id, referral_code } = await req.json();

    if (!claim_id) {
      return new Response(JSON.stringify({ error: 'claim_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!referral_code) {
      return new Response(JSON.stringify({ error: 'referral_code is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the claim — validate it belongs to this rider
    const { data: claim, error: claimError } = await supabase
      .from('deal_claims')
      .select('id, status, referring_driver_id, rider_user_id')
      .eq('id', claim_id)
      .eq('rider_user_id', user.id)
      .single();

    if (claimError || !claim) {
      return new Response(JSON.stringify({ error: 'Claim not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (claim.status !== 'reserved') {
      return new Response(JSON.stringify({ error: 'Claim is not in reserved status' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (claim.referring_driver_id !== null) {
      return new Response(JSON.stringify({ error: 'Driver already linked to this claim' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Look up driver by referral code (case-insensitive) using admin client to bypass RLS
    const { data: driverProfile, error: driverError } = await adminSupabase
      .from('driver_profiles')
      .select('id, user_id, verification_status')
      .ilike('referral_code', referral_code)
      .single();

    if (driverError || !driverProfile) {
      return new Response(JSON.stringify({ error: 'Driver not found for this referral code' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only staff-approved drivers can earn bonuses.
    if (driverProfile.verification_status !== 'approved') {
      return new Response(JSON.stringify({ error: "This driver's account isn't verified yet, so their code can't be added." }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: driverUser } = await adminSupabase
      .from('users')
      .select('full_name')
      .eq('id', driverProfile.user_id)
      .single();

    const driverName = driverUser?.full_name ?? 'Your driver';

    // Link the driver to the claim using service role (bypasses RLS)
    const { error: updateError } = await adminSupabase
      .from('deal_claims')
      .update({ referring_driver_id: driverProfile.id })
      .eq('id', claim_id);

    if (updateError) {
      return new Response(JSON.stringify({ error: 'Failed to link driver' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ driver_name: driverName }), {
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
