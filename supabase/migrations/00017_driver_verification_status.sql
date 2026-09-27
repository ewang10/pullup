-- 1. Add verification_status column with check constraint
ALTER TABLE driver_profiles
  ADD COLUMN verification_status text NOT NULL DEFAULT 'pending'
  CHECK (verification_status IN ('pending', 'approved', 'rejected'));
-- 2. Backfill existing approved drivers
UPDATE driver_profiles SET verification_status = 'approved' WHERE is_verified = true;
-- 3. Update get_pending_drivers() to filter by status (not is_verified)
CREATE OR REPLACE FUNCTION public.get_pending_drivers()
RETURNS TABLE (
  driver_profile_id   uuid,
  user_id             uuid,
  full_name           text,
  email               text,
  phone               text,
  rideshare_platform  text,
  rideshare_driver_id text,
  applied_at          timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT dp.id, u.id, u.full_name, u.email, u.phone,
         dp.rideshare_platform, dp.rideshare_driver_id, dp.created_at
  FROM driver_profiles dp
  JOIN users u ON u.id = dp.user_id
  WHERE dp.verification_status = 'pending'
  ORDER BY dp.created_at ASC;
END;
$$;
-- 4. New RPC: get_rejected_drivers() — admin-only
CREATE OR REPLACE FUNCTION public.get_rejected_drivers()
RETURNS TABLE (
  driver_profile_id   uuid,
  user_id             uuid,
  full_name           text,
  email               text,
  phone               text,
  rideshare_platform  text,
  rideshare_driver_id text,
  applied_at          timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT dp.id, u.id, u.full_name, u.email, u.phone,
         dp.rideshare_platform, dp.rideshare_driver_id, dp.created_at
  FROM driver_profiles dp
  JOIN users u ON u.id = dp.user_id
  WHERE dp.verification_status = 'rejected'
  ORDER BY dp.created_at DESC;
END;
$$;
-- 5. Update set_driver_verified() to also set verification_status
CREATE OR REPLACE FUNCTION public.set_driver_verified(
  p_driver_profile_id uuid,
  p_verified          boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE driver_profiles
  SET
    is_verified         = p_verified,
    verification_status = CASE WHEN p_verified THEN 'approved' ELSE 'rejected' END
  WHERE id = p_driver_profile_id;
END;
$$;
