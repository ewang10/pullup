import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function should be called via a cron job (e.g., every 5 minutes)
// Set up in Supabase Dashboard > Edge Functions > Cron
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify this is called with the service role key or a valid cron secret
    const authHeader = req.headers.get('Authorization');
    const cronSecret = Deno.env.get('CRON_SECRET');

    if (cronSecret) {
      const providedSecret = req.headers.get('x-cron-secret');
      if (providedSecret !== cronSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const now = new Date().toISOString();

    // Find and expire all claims past their hold duration
    const { data: expiredClaims, error } = await supabase
      .from('deal_claims')
      .update({ status: 'expired' })
      .eq('status', 'reserved')
      .lt('expires_at', now)
      .select('id');

    if (error) {
      return new Response(JSON.stringify({ error: 'Failed to expire claims', details: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      message: `Expired ${expiredClaims?.length ?? 0} claims`,
      expired_claim_ids: expiredClaims?.map((c) => c.id) ?? [],
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
