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

    // Service role client for queries that must see all riders' claims (e.g., daily cap check)
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Drivers are linked later through link-driver, which checks approval;
    // any referring_driver_id sent by the client is ignored.
    const { deal_id } = await req.json();

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

    // Expire any stale reserved claims for this rider on this deal
    const now = new Date();
    await supabase
      .from('deal_claims')
      .update({ status: 'expired' })
      .eq('deal_id', deal_id)
      .eq('rider_user_id', user.id)
      .eq('status', 'reserved')
      .lt('expires_at', now.toISOString());

    // Check daily cap: count active reserved claims + all completed claims today
    const today = now.toISOString().split('T')[0];

    // Count reserved claims that haven't expired yet (use service role to see ALL riders)
    const { count: activeReserved } = await adminSupabase
      .from('deal_claims')
      .select('*', { count: 'exact', head: true })
      .eq('deal_id', deal_id)
      .eq('status', 'reserved')
      .gte('reserved_at', `${today}T00:00:00Z`)
      .lt('reserved_at', `${today}T23:59:59Z`)
      .gt('expires_at', now.toISOString());

    // Count completed claims (these always count toward the cap)
    const { count: completedClaims } = await adminSupabase
      .from('deal_claims')
      .select('*', { count: 'exact', head: true })
      .eq('deal_id', deal_id)
      .eq('status', 'completed')
      .gte('reserved_at', `${today}T00:00:00Z`)
      .lt('reserved_at', `${today}T23:59:59Z`);

    const totalActiveClaims = (activeReserved ?? 0) + (completedClaims ?? 0);

    if (totalActiveClaims >= deal.daily_cap) {
      return new Response(JSON.stringify({ error: 'No more spots available for this deal today. Try again tomorrow!' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if rider already has an active (non-expired) claim for this deal
    const { data: existingClaim } = await supabase
      .from('deal_claims')
      .select('id')
      .eq('deal_id', deal_id)
      .eq('rider_user_id', user.id)
      .eq('status', 'reserved')
      .gt('expires_at', now.toISOString())
      .single();

    if (existingClaim) {
      return new Response(JSON.stringify({ error: 'You already have an active claim for this deal' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create the claim
    const expiresAt = new Date(now.getTime() + deal.hold_duration_minutes * 60 * 1000);

    // Riders cannot insert claims directly (RLS); create it here after the checks above.
    const { data: claim, error: claimError } = await adminSupabase
      .from('deal_claims')
      .insert({
        deal_id,
        rider_user_id: user.id,
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
