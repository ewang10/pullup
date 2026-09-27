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
    // Verify the caller's JWT is valid
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

    // Use service role for all DB queries (bypasses RLS, safe since JWT is already validated)
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify requesting user is platform_admin or platform_support
    const { data: callerData } = await adminSupabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!callerData || !['platform_admin', 'platform_support'].includes(callerData.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { venue_id } = await req.json();

    if (!venue_id) {
      return new Response(JSON.stringify({ error: 'venue_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch current image_url
    const { data: venue } = await adminSupabase
      .from('venues')
      .select('image_url')
      .eq('id', venue_id)
      .single();

    // If image exists, extract storage path and delete from storage
    if (venue?.image_url) {
      const url = new URL(venue.image_url);
      // Path after /storage/v1/object/public/venue-images/
      const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/venue-images\/(.+)/);
      if (pathMatch) {
        await adminSupabase.storage.from('venue-images').remove([pathMatch[1]]);
      }
    }

    // Clear image_url and hero_image_updated_at
    const { error: updateError } = await adminSupabase
      .from('venues')
      .update({ image_url: null, hero_image_updated_at: null })
      .eq('id', venue_id);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ message: 'Image removed successfully' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
