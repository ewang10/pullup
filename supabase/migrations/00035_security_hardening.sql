-- Access-control hardening from a full review.
--
-- Key rule: never trust auth user_metadata for authorization. Users can edit
-- their own user_metadata (supabase.auth.updateUser), so roles are read from
-- public.users, which only the service role can change.

-- ---------------------------------------------------------------------------
-- 1. Sign-up may only create rider, driver or venue_admin accounts.
--    Previously the role came straight from sign-up metadata, so anyone could
--    create a platform_admin account through the Auth API.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.safe_signup_role(p_requested text)
RETURNS user_role LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_requested IN ('rider', 'driver', 'venue_admin') THEN p_requested::user_role
              ELSE 'rider'::user_role END
$$;

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure) INTO v_def;
  IF position($q$COALESCE(NEW.raw_user_meta_data ->> 'role', 'rider')::user_role$q$ IN v_def) = 0 THEN
    RAISE EXCEPTION 'handle_new_user changed; update this migration';
  END IF;
  v_def := replace(v_def,
    $q$COALESCE(NEW.raw_user_meta_data ->> 'role', 'rider')::user_role$q$,
    $q$public.safe_signup_role(NEW.raw_user_meta_data ->> 'role')$q$);
  EXECUTE v_def;
END;
$$;

-- Keep auth metadata in line with the real role for accounts that already
-- claimed a platform role at sign-up without being given one.
UPDATE auth.users au
SET raw_user_meta_data = au.raw_user_meta_data || jsonb_build_object('role', u.role::text)
FROM public.users u
WHERE u.id = au.id
  AND (au.raw_user_meta_data ->> 'role') IS DISTINCT FROM u.role::text;

-- Role lookup for policies and triggers (from public.users, not the JWT).
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role::text FROM public.users WHERE id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- 2. Money functions are internal: only edge functions (service role) call
--    them. They were executable by anyone holding the public anon key.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.increment_driver_earnings(uuid, decimal) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_rider_balance(uuid, decimal) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_rider_cashout_balance(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stale_claims() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_driver_earnings(uuid, decimal) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_rider_balance(uuid, decimal) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_rider_cashout_balance(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_claims() TO service_role;

-- Legacy staff RPCs superseded by get_drivers_for_review / review_driver.
REVOKE ALL ON FUNCTION public.get_pending_drivers() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_rejected_drivers() FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 3. Staff can read all users based on their real role, not JWT metadata.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_platform_admin" ON public.users;
CREATE POLICY "users_select_platform_admin"
  ON public.users FOR SELECT
  USING (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 4. Claims: created only by the claim-deal function (which checks the deal,
--    daily cap and duplicates), and changed by staff only through reviewed
--    functions (verify-receipt, set_venue_bill_amount, extend deadline).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "deal_claims_insert_rider" ON public.deal_claims;
DROP POLICY IF EXISTS "deal_claims_update_platform" ON public.deal_claims;

-- Rider claim updates: restrict every non-staff user, whatever their JWT says
-- (the old check trusted user_metadata.role, which users can change).
CREATE OR REPLACE FUNCTION restrict_deal_claims_rider_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role (edge functions, cron) has no auth.uid().
  IF auth.uid() IS NULL OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Riders cannot change claim status directly';
  END IF;
  IF NEW.referring_driver_id IS DISTINCT FROM OLD.referring_driver_id
    OR NEW.ride_receipt_verified IS DISTINCT FROM OLD.ride_receipt_verified
    OR NEW.ride_credit_paid IS DISTINCT FROM OLD.ride_credit_paid
    OR NEW.driver_kickback_paid IS DISTINCT FROM OLD.driver_kickback_paid
    OR NEW.venue_charged IS DISTINCT FROM OLD.venue_charged
    OR NEW.driver_transaction_id IS DISTINCT FROM OLD.driver_transaction_id
    OR NEW.venue_bill_amount IS DISTINCT FROM OLD.venue_bill_amount
    OR NEW.receipt_due_at IS DISTINCT FROM OLD.receipt_due_at
    OR NEW.unverified_at IS DISTINCT FROM OLD.unverified_at
    OR NEW.deal_id IS DISTINCT FROM OLD.deal_id
    OR NEW.rider_user_id IS DISTINCT FROM OLD.rider_user_id
    OR NEW.reserved_at IS DISTINCT FROM OLD.reserved_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'Riders can only upload receipts on their claims';
  END IF;
  IF OLD.status <> 'completed'
    AND (NEW.ride_receipt_url IS DISTINCT FROM OLD.ride_receipt_url
         OR NEW.venue_receipt_url IS DISTINCT FROM OLD.venue_receipt_url) THEN
    RAISE EXCEPTION 'Upload receipts after checking in at the venue';
  END IF;
  IF OLD.unverified_at IS NOT NULL
    AND (NEW.ride_receipt_url IS DISTINCT FROM OLD.ride_receipt_url
         OR NEW.venue_receipt_url IS DISTINCT FROM OLD.venue_receipt_url) THEN
    RAISE EXCEPTION 'The receipt deadline for this visit has passed';
  END IF;
  IF (NEW.ride_receipt_status IS DISTINCT FROM OLD.ride_receipt_status
        AND NEW.ride_receipt_status IS DISTINCT FROM 'pending_review')
    OR (NEW.venue_receipt_status IS DISTINCT FROM OLD.venue_receipt_status
        AND NEW.venue_receipt_status IS DISTINCT FROM 'pending_review') THEN
    RAISE EXCEPTION 'Riders can only submit receipts for review';
  END IF;
  IF (OLD.ride_receipt_status = 'approved' AND NEW.ride_receipt_url IS DISTINCT FROM OLD.ride_receipt_url)
    OR (OLD.venue_receipt_status = 'approved' AND NEW.venue_receipt_url IS DISTINCT FROM OLD.venue_receipt_url) THEN
    RAISE EXCEPTION 'This receipt was already approved';
  END IF;
  RETURN NEW;
END;
$$;

-- Venue owners may not set platform-managed venue fields directly.
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
    OR NEW.payment_suspended IS DISTINCT FROM OLD.payment_suspended THEN
    RAISE EXCEPTION 'Billing fields are managed by PullUp';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_restrict_venue_owner_update ON public.venues;
CREATE TRIGGER trg_restrict_venue_owner_update
  BEFORE UPDATE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.restrict_venue_owner_update();

-- ---------------------------------------------------------------------------
-- 5. Venue privacy: active venues are public listings, but billing details
--    and the owner's private estimate were readable by anyone. Grant only
--    listing columns to clients; owners read private fields via a function.
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.venues FROM anon, authenticated;
GRANT SELECT (id, owner_user_id, name, description, category, address, city, state,
              latitude, longitude, image_url, is_active, created_at, hero_image_updated_at,
              payment_suspended)
  ON public.venues TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_venue_private()
RETURNS TABLE (
  venue_id                 uuid,
  avg_check_amount         numeric,
  has_payment_method       boolean,
  stripe_bank_last4        text,
  stripe_bank_institution  text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.id, v.avg_check_amount, v.stripe_payment_method_id IS NOT NULL,
         v.stripe_bank_last4, v.stripe_bank_institution
  FROM venues v WHERE v.owner_user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.get_my_venue_private() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_venue_private() TO authenticated;

-- Policies that read private venue columns now use definer helpers.
CREATE OR REPLACE FUNCTION public.owns_venue_ready_for_deals(p_venue_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM venues
    WHERE id = p_venue_id AND owner_user_id = auth.uid() AND stripe_payment_method_id IS NOT NULL
  )
$$;

DROP POLICY IF EXISTS "deals_insert_own_venue" ON public.deals;
CREATE POLICY "deals_insert_own_venue"
  ON public.deals FOR INSERT
  WITH CHECK (public.owns_venue_ready_for_deals(venue_id));

-- ---------------------------------------------------------------------------
-- 6. Staff review functions: pin search_path on older helpers.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.prevent_role_escalation() SET search_path = public;
