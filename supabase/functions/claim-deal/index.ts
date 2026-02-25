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

    const { deal_id, referring_driver_id } = await req.json();

    if (!deal_id) {
      return new Response(JSON.stringify({ error: 'deal_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the deal
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('*, venue:venues(*)')
      .eq('id', deal_id)
      .eq('is_active', true)
      .single();

    if (dealError || !deal) {
      return new Response(JSON.stringify({ error: 'Deal not found or inactive' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check daily cap
    const today = new Date().toISOString().split('T')[0];
    const { count: todayClaims } = await supabase
      .from('deal_claims')
      .select('*', { count: 'exact', head: true })
      .eq('deal_id', deal_id)
      .in('status', ['reserved', 'completed'])
      .gte('reserved_at', `${today}T00:00:00Z`)
      .lt('reserved_at', `${today}T23:59:59Z`);

    if ((todayClaims ?? 0) >= deal.daily_cap) {
      return new Response(JSON.stringify({ error: 'Daily cap reached for this deal' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if rider already has an active claim for this deal
    const { data: existingClaim } = await supabase
      .from('deal_claims')
      .select('id')
      .eq('deal_id', deal_id)
      .eq('rider_user_id', user.id)
      .eq('status', 'reserved')
      .single();

    if (existingClaim) {
      return new Response(JSON.stringify({ error: 'You already have an active claim for this deal' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create the claim
    const now = new Date();
    const expiresAt = new Date(now.getTime() + deal.hold_duration_minutes * 60 * 1000);

    const { data: claim, error: claimError } = await supabase
      .from('deal_claims')
      .insert({
        deal_id,
        rider_user_id: user.id,
        referring_driver_id: referring_driver_id || null,
        status: 'reserved',
        reserved_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (claimError) {
      return new Response(JSON.stringify({ error: 'Failed to create claim', details: claimError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ claim, deal }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
