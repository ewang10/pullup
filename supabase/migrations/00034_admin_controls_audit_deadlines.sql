-- Admin-only suspensions with a payout rule, a driver review history, and
-- receipt deadlines that close unverified visits.

-- ---------------------------------------------------------------------------
-- 1. Roles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'platform_admin')
$$;

-- ---------------------------------------------------------------------------
-- 2. Driver status: add "suspended" (approved driver put on hold by an admin)
--    and an optional payout hold for suspected fraud.
-- ---------------------------------------------------------------------------
ALTER TABLE public.driver_profiles DROP CONSTRAINT IF EXISTS driver_profiles_verification_status_check;
ALTER TABLE public.driver_profiles
  ADD CONSTRAINT driver_profiles_verification_status_check
  CHECK (verification_status IN ('pending', 'approved', 'rejected', 'suspended'));

ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS payouts_on_hold boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.driver_profiles.payouts_on_hold IS
  'Set by an admin when suspending for suspected fraud: earned bonuses cannot be cashed out.';

-- ---------------------------------------------------------------------------
-- 3. Review history: who decided what, when and why. Readable by staff and
--    admins; written only by review_driver().
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_review_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_profile_id uuid        NOT NULL REFERENCES public.driver_profiles(id) ON DELETE CASCADE,
  actor_user_id     uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  actor_name        text        NOT NULL,
  actor_role        text        NOT NULL,
  action            text        NOT NULL CHECK (action IN ('approved', 'rejected', 'suspended', 'reinstated')),
  note              text,
  payouts_on_hold   boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_driver_review_events_driver ON public.driver_review_events (driver_profile_id, created_at DESC);

ALTER TABLE public.driver_review_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "driver_review_events_select_staff"
  ON public.driver_review_events FOR SELECT
  USING (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 4. One review function with the permission rules:
--    pending   -> approve | reject          (support or admin)
--    rejected  -> approve | reject (edit)   (support or admin)
--    approved  -> suspend                   (admin only, reason required)
--    suspended -> reinstate | suspend (edit)(admin only)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.set_driver_verified(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.set_driver_verified(uuid, boolean);

CREATE OR REPLACE FUNCTION public.review_driver(
  p_driver_profile_id uuid,
  p_action            text,
  p_note              text DEFAULT NULL,
  p_hold_payouts      boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_actor  record;
  v_note   text := nullif(btrim(p_note), '');
  v_new    text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT verification_status INTO v_status FROM driver_profiles WHERE id = p_driver_profile_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Driver not found';
  END IF;

  SELECT id, coalesce(nullif(full_name, ''), email) AS name, role::text AS role
    INTO v_actor FROM users WHERE id = auth.uid();

  IF p_action = 'approve' AND v_status IN ('pending', 'rejected') THEN
    v_new := 'approved';
  ELSIF p_action = 'reject' AND v_status IN ('pending', 'rejected') THEN
    v_new := 'rejected';
  ELSIF p_action = 'suspend' AND v_status IN ('approved', 'suspended') THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only admins can suspend an approved driver';
    END IF;
    v_new := 'suspended';
  ELSIF p_action = 'reinstate' AND v_status = 'suspended' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only admins can reinstate a suspended driver';
    END IF;
    v_new := 'approved';
  ELSE
    RAISE EXCEPTION 'Cannot % a driver who is %', p_action, v_status;
  END IF;

  IF v_new IN ('rejected', 'suspended') AND v_note IS NULL THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  UPDATE driver_profiles
  SET verification_status = v_new,
      is_verified         = (v_new = 'approved'),
      verification_note   = CASE WHEN v_new = 'approved' THEN NULL ELSE v_note END,
      payouts_on_hold     = (v_new = 'suspended' AND coalesce(p_hold_payouts, false)),
      reviewed_at         = now()
  WHERE id = p_driver_profile_id;

  INSERT INTO driver_review_events (driver_profile_id, actor_user_id, actor_name, actor_role, action, note, payouts_on_hold)
  VALUES (
    p_driver_profile_id, v_actor.id, coalesce(v_actor.name, 'Staff'), coalesce(v_actor.role, 'unknown'),
    CASE p_action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected'
                  WHEN 'suspend' THEN 'suspended' ELSE 'reinstated' END,
    v_note,
    v_new = 'suspended' AND coalesce(p_hold_payouts, false)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.review_driver(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_driver(uuid, text, text, boolean) TO authenticated;

-- Staff list, now with suspended drivers, payout hold and review history.
DROP FUNCTION IF EXISTS public.get_drivers_for_review(text);
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
  payouts_on_hold     boolean,
  payout_balance      decimal,
  applied_at          timestamptz,
  reviewed_at         timestamptz,
  history             jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT dp.id, u.full_name, u.email, u.phone, dp.rideshare_platform, dp.rideshare_driver_id,
         dp.verification_status, dp.verification_note, dp.payouts_on_hold, dp.payout_balance,
         dp.created_at, dp.reviewed_at,
         coalesce((
           SELECT jsonb_agg(jsonb_build_object(
                    'action', e.action, 'note', e.note, 'actor_name', e.actor_name,
                    'actor_role', e.actor_role, 'payouts_on_hold', e.payouts_on_hold,
                    'created_at', e.created_at) ORDER BY e.created_at DESC)
           FROM driver_review_events e WHERE e.driver_profile_id = dp.id
         ), '[]'::jsonb)
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
-- 5. Receipt deadlines. Receipts are due 7 days after check-in unless an
--    admin extends it. Overdue visits close as "not verified": no venue
--    charge, no rider credit, no driver bonus.
-- ---------------------------------------------------------------------------
ALTER TABLE public.deal_claims
  ADD COLUMN IF NOT EXISTS receipt_due_at  timestamptz,
  ADD COLUMN IF NOT EXISTS unverified_at   timestamptz;

COMMENT ON COLUMN public.deal_claims.receipt_due_at IS
  'Admin-extended receipt deadline; default is completed_at + 7 days.';
COMMENT ON COLUMN public.deal_claims.unverified_at IS
  'Set when required receipts were not approved by the deadline; the visit is not charged or credited.';

CREATE OR REPLACE FUNCTION public.receipt_deadline(p_completed_at timestamptz, p_due_at timestamptz)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(p_due_at, p_completed_at + interval '7 days')
$$;

CREATE OR REPLACE FUNCTION public.close_overdue_receipt_claims()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(dc.id) INTO v_ids
  FROM deal_claims dc
  JOIN deals d ON d.id = dc.deal_id
  WHERE dc.status = 'completed'
    AND dc.unverified_at IS NULL
    AND dc.ride_credit_paid = false
    AND (d.requires_ride_receipt OR d.requires_venue_receipt)
    AND public.receipt_deadline(dc.completed_at, dc.receipt_due_at) < now()
    AND NOT (
      (NOT d.requires_ride_receipt OR dc.ride_receipt_status = 'approved')
      AND (NOT d.requires_venue_receipt OR dc.venue_receipt_status = 'approved')
    );

  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE deal_claims SET unverified_at = now() WHERE id = ANY (v_ids);
  UPDATE transactions SET status = 'failed' WHERE deal_claim_id = ANY (v_ids) AND status = 'pending';
  RETURN array_length(v_ids, 1);
END;
$$;
REVOKE ALL ON FUNCTION public.close_overdue_receipt_claims() FROM PUBLIC, anon, authenticated;

-- Admins can give a rider more time (from now).
CREATE OR REPLACE FUNCTION public.extend_receipt_deadline(p_claim_id uuid, p_days integer DEFAULT 7)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_due timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can extend a receipt deadline';
  END IF;
  IF p_days NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Extend by 1 to 30 days';
  END IF;
  UPDATE deal_claims
  SET receipt_due_at = greatest(now(), public.receipt_deadline(completed_at, receipt_due_at)) + make_interval(days => p_days)
  WHERE id = p_claim_id AND status = 'completed' AND unverified_at IS NULL
  RETURNING receipt_due_at INTO v_due;
  IF v_due IS NULL THEN
    RAISE EXCEPTION 'Only open visits can be extended';
  END IF;
  RETURN v_due;
END;
$$;
REVOKE ALL ON FUNCTION public.extend_receipt_deadline(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extend_receipt_deadline(uuid, integer) TO authenticated;

-- Staff queue: include the deadline.
DROP FUNCTION IF EXISTS public.get_receipt_queue();
CREATE OR REPLACE FUNCTION public.get_receipt_queue()
RETURNS TABLE (
  claim_id               uuid,
  completed_at           timestamptz,
  receipt_due_at         timestamptz,
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
  SELECT dc.id, dc.completed_at, public.receipt_deadline(dc.completed_at, dc.receipt_due_at), d.title, v.name,
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
    AND dc.unverified_at IS NULL
    AND (dc.ride_receipt_status = 'pending_review' OR dc.venue_receipt_status = 'pending_review')
  ORDER BY public.receipt_deadline(dc.completed_at, dc.receipt_due_at) ASC
  LIMIT 200;
END;
$$;
REVOKE ALL ON FUNCTION public.get_receipt_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_receipt_queue() TO authenticated;

-- Riders can't upload receipts on visits that were closed as not verified,
-- or change deadline fields.
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
      OR NEW.venue_bill_amount IS DISTINCT FROM OLD.venue_bill_amount
      OR NEW.receipt_due_at IS DISTINCT FROM OLD.receipt_due_at
      OR NEW.unverified_at IS DISTINCT FROM OLD.unverified_at
      OR NEW.deal_id IS DISTINCT FROM OLD.deal_id
      OR NEW.rider_user_id IS DISTINCT FROM OLD.rider_user_id
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'Riders can only upload receipts on their claims';
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
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Schedule housekeeping with pg_cron: expire unused holds every minute
--    (expire_stale_claims, defined in 00001 but never scheduled) and close
--    overdue receipt visits hourly.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.unschedule(jobname) FROM cron.job
WHERE jobname IN ('expire-stale-claims', 'close-overdue-receipt-claims');

SELECT cron.schedule('expire-stale-claims', '* * * * *', $$SELECT public.expire_stale_claims()$$);
SELECT cron.schedule('close-overdue-receipt-claims', '7 * * * *', $$SELECT public.close_overdue_receipt_claims()$$);
