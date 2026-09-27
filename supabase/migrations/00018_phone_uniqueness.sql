-- 1. Add UNIQUE constraint on users.phone
-- NULL values are considered distinct in PostgreSQL, so users without a
-- phone number (riders) do not conflict with each other.
ALTER TABLE users ADD CONSTRAINT users_phone_key UNIQUE (phone);
-- 2. Update handle_new_user() to persist phone from sign-up metadata.
-- Previously phone was stored only in auth.users.raw_user_meta_data and
-- never written to public.users. This also catches phone unique violations
-- and raises a recognisable exception (phone_already_registered) so that
-- the caller can surface a specific error message.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role       user_role;
  v_full_name  text;
  v_phone      text;
  v_code       text;
  v_chars      text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_profile_id uuid;
  i            integer;
BEGIN
  v_role      := COALESCE(NEW.raw_user_meta_data ->> 'role', 'rider')::user_role;
  v_full_name := COALESCE(NEW.raw_user_meta_data ->> 'full_name', '');
  -- Treat blank string the same as no phone provided
  v_phone     := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'phone', '')), '');

  BEGIN
    INSERT INTO public.users (id, email, phone, full_name, role)
    VALUES (NEW.id, NEW.email, v_phone, v_full_name, v_role);
  EXCEPTION
    WHEN unique_violation THEN
      -- email uniqueness is enforced by auth.users before this trigger fires,
      -- so the only unique violation reachable here is the phone constraint.
      RAISE EXCEPTION 'phone_already_registered';
  END;

  IF v_role = 'driver' THEN
    LOOP
      v_code := '';
      FOR i IN 1..8 LOOP
        v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
      END LOOP;

      BEGIN
        INSERT INTO public.driver_profiles (user_id, referral_code)
        VALUES (NEW.id, v_code)
        RETURNING id INTO v_profile_id;
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          NULL;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
-- 3. is_phone_available() — called from the sign-up screen before hitting the
-- auth API so we can surface a specific error instead of relying on the
-- generic trigger exception message that Supabase wraps as
-- "Database error saving new user".
CREATE OR REPLACE FUNCTION public.is_phone_available(p_phone text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.users WHERE phone = p_phone);
$$;
