-- Staff review tooling, driver rejection reasons, tighter rider claim updates,
-- and private receipt storage.

-- ---------------------------------------------------------------------------
-- 1. Let the service role assign roles (e.g. create staff accounts from a
--    trusted script). End users still cannot change their own role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Role changes are not permitted via this operation';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Driver review: rejection reason and review time, shown to the driver.
-- ---------------------------------------------------------------------------
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS verification_note text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

DROP FUNCTION IF EXISTS public.set_driver_verified(uuid, boolean);
CREATE OR REPLACE FUNCTION public.set_driver_verified(
  p_driver_profile_id uuid,
  p_verified          boolean,
  p_note              text DEFAULT NULL
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
    verification_status = CASE WHEN p_verified THEN 'approved' ELSE 'rejected' END,
    verification_note   = CASE WHEN p_verified THEN NULL ELSE nullif(btrim(p_note), '') END,
    reviewed_at         = now()
  WHERE id = p_driver_profile_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_driver_verified(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_driver_verified(uuid, boolean, text) TO authenticated;

-- Staff driver list with review details (admin + support only).
CREATE OR REPLACE FUNCTION public.get_drivers_for_review(p_status text)
RETURNS TABLE (
  driver_profile_id   uuid,
  full_name           text,
  email               text,
  phone               text,
  rideshare_platform  text,
  rideshare_driver_id text,
  verification_status text,
  verification_note   text,
  applied_at          timestamptz,
  reviewed_at         timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT dp.id, u.full_name, u.email, u.phone, dp.rideshare_platform, dp.rideshare_driver_id,
         dp.verification_status, dp.verification_note, dp.created_at, dp.reviewed_at
  FROM driver_profiles dp
  JOIN users u ON u.id = dp.user_id
  WHERE dp.verification_status = p_status
  ORDER BY CASE WHEN p_status = 'pending' THEN dp.created_at END ASC,
           coalesce(dp.reviewed_at, dp.created_at) DESC
  LIMIT 200;
END;
$$;
REVOKE ALL ON FUNCTION public.get_drivers_for_review(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_drivers_for_review(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Receipt review queue (admin + support only): completed claims with a
--    receipt waiting for review.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_receipt_queue()
RETURNS TABLE (
  claim_id               uuid,
  completed_at           timestamptz,
  deal_title             text,
  venue_name             text,
  rider_display_name     text,
  ride_credit_amount     decimal,
  requires_ride_receipt  boolean,
  requires_venue_receipt boolean,
  ride_receipt_url       text,
  ride_receipt_status    text,
  venue_receipt_url      text,
  venue_receipt_status   text,
  has_driver             boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT dc.id, dc.completed_at, d.title, v.name,
    CASE
      WHEN coalesce(btrim(u.full_name), '') = '' THEN 'Rider'
      WHEN strpos(btrim(u.full_name), ' ') = 0 THEN btrim(u.full_name)
      ELSE split_part(btrim(u.full_name), ' ', 1) || ' '
        || upper(left(regexp_replace(btrim(u.full_name), '^.*\s', ''), 1)) || '.'
    END,
    d.ride_credit_amount, d.requires_ride_receipt, d.requires_venue_receipt,
    dc.ride_receipt_url, dc.ride_receipt_status, dc.venue_receipt_url, dc.venue_receipt_status,
    dc.referring_driver_id IS NOT NULL
  FROM deal_claims dc
  JOIN deals d  ON d.id = dc.deal_id
  JOIN venues v ON v.id = d.venue_id
  JOIN users u  ON u.id = dc.rider_user_id
  WHERE dc.status = 'completed'
    AND (dc.ride_receipt_status = 'pending_review' OR dc.venue_receipt_status = 'pending_review')
  ORDER BY dc.completed_at ASC
  LIMIT 200;
END;
$$;
REVOKE ALL ON FUNCTION public.get_receipt_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_receipt_queue() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Riders may only upload receipts on their claims: set a receipt path and
--    mark it pending review. Payment flags, verification, review outcomes and
--    the linked driver are set by staff or edge functions (service role).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION restrict_deal_claims_rider_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := auth.jwt() -> 'user_metadata' ->> 'role';
  IF v_role = 'rider' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Riders cannot change claim status directly';
    END IF;
    IF NEW.referring_driver_id IS DISTINCT FROM OLD.referring_driver_id
      OR NEW.ride_receipt_verified IS DISTINCT FROM OLD.ride_receipt_verified
      OR NEW.ride_credit_paid IS DISTINCT FROM OLD.ride_credit_paid
      OR NEW.driver_kickback_paid IS DISTINCT FROM OLD.driver_kickback_paid
      OR NEW.venue_charged IS DISTINCT FROM OLD.venue_charged
      OR NEW.driver_transaction_id IS DISTINCT FROM OLD.driver_transaction_id
      OR NEW.deal_id IS DISTINCT FROM OLD.deal_id
      OR NEW.rider_user_id IS DISTINCT FROM OLD.rider_user_id
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'Riders can only upload receipts on their claims';
    END IF;
    IF (NEW.ride_receipt_status IS DISTINCT FROM OLD.ride_receipt_status
          AND NEW.ride_receipt_status IS DISTINCT FROM 'pending_review')
      OR (NEW.venue_receipt_status IS DISTINCT FROM OLD.venue_receipt_status
          AND NEW.venue_receipt_status IS DISTINCT FROM 'pending_review') THEN
      RAISE EXCEPTION 'Riders can only submit receipts for review';
    END IF;
    -- Approved receipts are final.
    IF (OLD.ride_receipt_status = 'approved' AND NEW.ride_receipt_url IS DISTINCT FROM OLD.ride_receipt_url)
      OR (OLD.venue_receipt_status = 'approved' AND NEW.venue_receipt_url IS DISTINCT FROM OLD.venue_receipt_url) THEN
      RAISE EXCEPTION 'This receipt was already approved';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Private receipts. Objects live at receipts/<claim_id>/<file>. Riders can
--    upload and read receipts for their own claims; staff can read all.
-- ---------------------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'receipts';

DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update receipts" ON storage.objects;

CREATE POLICY "receipts_insert_own_claim"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND EXISTS (
    SELECT 1 FROM public.deal_claims dc
    WHERE dc.id::text = (storage.foldername(name))[2]
      AND dc.rider_user_id = auth.uid()
  )
);

CREATE POLICY "receipts_select_own_or_staff"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'receipts'
  AND (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.deal_claims dc
      WHERE dc.id::text = (storage.foldername(name))[2]
        AND dc.rider_user_id = auth.uid()
    )
  )
);
