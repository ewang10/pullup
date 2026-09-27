-- Grant platform_support the same review capabilities as platform_admin.
-- is_platform_admin() gates get_pending_drivers(), get_rejected_drivers(),
-- and set_driver_verified() — updating it here gives support access to all three.

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role IN ('platform_admin', 'platform_support')
  )
$$;
