-- Typed check-in codes: an alternative to scanning the venue QR code, for
-- riders who can't use the camera (accessibility) or whose camera fails.
-- The code is shown only to the venue owner (to print or tell riders); it is
-- not in the public venue columns, so it can't be read remotely.

CREATE OR REPLACE FUNCTION public.generate_checkin_code()
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code  text;
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM venues WHERE checkin_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS checkin_code text;
UPDATE public.venues SET checkin_code = public.generate_checkin_code() WHERE checkin_code IS NULL;
ALTER TABLE public.venues ALTER COLUMN checkin_code SET NOT NULL;
ALTER TABLE public.venues ALTER COLUMN checkin_code SET DEFAULT public.generate_checkin_code();
CREATE UNIQUE INDEX IF NOT EXISTS venues_checkin_code_key ON public.venues (checkin_code);

-- Owners can't pick their own code (keeps codes unguessable and unique).
CREATE OR REPLACE FUNCTION public.restrict_venue_owner_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
    OR NEW.stripe_payment_method_id IS DISTINCT FROM OLD.stripe_payment_method_id
    OR NEW.stripe_bank_last4 IS DISTINCT FROM OLD.stripe_bank_last4
    OR NEW.stripe_bank_institution IS DISTINCT FROM OLD.stripe_bank_institution
    OR NEW.payment_suspended IS DISTINCT FROM OLD.payment_suspended
    OR NEW.checkin_code IS DISTINCT FROM OLD.checkin_code THEN
    RAISE EXCEPTION 'Billing and check-in fields are managed by PullUp';
  END IF;
  RETURN NEW;
END;
$$;

-- Owner-only private fields now include the check-in code.
DROP FUNCTION IF EXISTS public.get_my_venue_private();
CREATE OR REPLACE FUNCTION public.get_my_venue_private()
RETURNS TABLE (
  venue_id                 uuid,
  avg_check_amount         numeric,
  has_payment_method       boolean,
  stripe_bank_last4        text,
  stripe_bank_institution  text,
  checkin_code             text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.id, v.avg_check_amount, v.stripe_payment_method_id IS NOT NULL,
         v.stripe_bank_last4, v.stripe_bank_institution, v.checkin_code
  FROM venues v WHERE v.owner_user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.get_my_venue_private() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_venue_private() TO authenticated;
