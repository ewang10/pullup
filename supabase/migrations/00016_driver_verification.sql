-- 1. Phone uniqueness on users table
ALTER TABLE users ADD CONSTRAINT users_phone_unique UNIQUE (phone);
-- 2. Rideshare verification fields on driver_profiles
ALTER TABLE driver_profiles
  ADD COLUMN rideshare_platform  text,   -- 'uber' | 'lyft' | 'both' | 'other'
  ADD COLUMN rideshare_driver_id text;
-- driver's platform-assigned ID

-- 3. Update handle_new_user trigger to populate new fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role      user_role;
  v_full_name text;
  v_code      text;
  v_chars     text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_profile_id uuid;
  i           integer;
BEGIN
  v_role      := COALESCE(NEW.raw_user_meta_data ->> 'role', 'rider')::user_role;
  v_full_name := COALESCE(NEW.raw_user_meta_data ->> 'full_name', '');

  INSERT INTO public.users (id, email, full_name, role, phone)
  VALUES (NEW.id, NEW.email, v_full_name, v_role,
          NEW.raw_user_meta_data ->> 'phone');

  IF v_role = 'driver' THEN
    LOOP
      v_code := '';
      FOR i IN 1..8 LOOP
        v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
      END LOOP;
      BEGIN
        INSERT INTO public.driver_profiles
          (user_id, referral_code, rideshare_platform, rideshare_driver_id)
        VALUES (NEW.id, v_code,
                NEW.raw_user_meta_data ->> 'rideshare_platform',
                NEW.raw_user_meta_data ->> 'rideshare_driver_id')
        RETURNING id INTO v_profile_id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
-- 4. Helper: is_platform_admin() — SECURITY DEFINER avoids RLS recursion
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'platform_admin'
  )
$$;
-- 5. RPC: get_pending_drivers() — admin-only, returns pending driver list
CREATE OR REPLACE FUNCTION public.get_pending_drivers()
RETURNS TABLE (
  driver_profile_id  uuid,
  user_id            uuid,
  full_name          text,
  email              text,
  phone              text,
  rideshare_platform text,
  rideshare_driver_id text,
  applied_at         timestamptz
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
  WHERE dp.is_verified = false
  ORDER BY dp.created_at ASC;
END;
$$;
-- 6. RPC: set_driver_verified() — admin-only approve/reject
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
  UPDATE driver_profiles SET is_verified = p_verified WHERE id = p_driver_profile_id;
END;
$$;
