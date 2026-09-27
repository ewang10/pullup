-- Migration 00018 rewrote handle_new_user() but accidentally dropped
-- rideshare_platform and rideshare_driver_id from the driver_profiles INSERT.
-- This restores them so driver review shows the correct platform and driver ID.

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
  v_phone     := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'phone', '')), '');

  BEGIN
    INSERT INTO public.users (id, email, phone, full_name, role)
    VALUES (NEW.id, NEW.email, v_phone, v_full_name, v_role);
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'phone_already_registered';
  END;

  IF v_role = 'driver' THEN
    LOOP
      v_code := '';
      FOR i IN 1..8 LOOP
        v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
      END LOOP;

      BEGIN
        INSERT INTO public.driver_profiles
          (user_id, referral_code, rideshare_platform, rideshare_driver_id)
        VALUES (
          NEW.id,
          v_code,
          NEW.raw_user_meta_data ->> 'rideshare_platform',
          NEW.raw_user_meta_data ->> 'rideshare_driver_id'
        )
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
