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

    // Verify requesting user is platform_admin
    const { data: callerData } = await adminSupabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (callerData?.role !== 'platform_admin') {
      return new Response(JSON.stringify({ error: 'Only platform admins can remove team members' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { target_user_id } = await req.json();

    if (!target_user_id) {
      return new Response(JSON.stringify({ error: 'target_user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prevent self-removal
    if (target_user_id === user.id) {
      return new Response(JSON.stringify({ error: 'You cannot remove yourself' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify target is a platform team member (not a rider/driver).
    // If the row is already gone (partial delete from a prior attempt), skip
    // straight to cleaning up auth.users.
    const { data: targetData } = await adminSupabase
      .from('users')
      .select('role')
      .eq('id', target_user_id)
      .single();

    if (targetData) {
      if (!['platform_admin', 'platform_support'].includes(targetData.role)) {
        return new Response(JSON.stringify({ error: 'Target user is not a platform team member' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error: deletePublicError } = await adminSupabase
        .from('users')
        .delete()
        .eq('id', target_user_id);

      if (deletePublicError) {
        return new Response(JSON.stringify({ error: deletePublicError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { error: deleteAuthError } = await adminSupabase.auth.admin.deleteUser(target_user_id);

    // "User not found" means no auth.users entry (e.g. seed/test users inserted
    // directly into public.users). The public row is already gone, so treat as success.
    if (deleteAuthError && !deleteAuthError.message.toLowerCase().includes('user not found')) {
      return new Response(JSON.stringify({ error: deleteAuthError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ message: 'Team member removed successfully' }), {
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
