-- Real spend from venue receipts. When staff approve a venue receipt they
-- record the bill total; venues then see the average spend of PullUp
-- customers instead of relying only on their own estimate.

ALTER TABLE public.deal_claims
  ADD COLUMN IF NOT EXISTS venue_bill_amount numeric(10, 2)
    CHECK (venue_bill_amount IS NULL OR (venue_bill_amount >= 0 AND venue_bill_amount <= 100000));

COMMENT ON COLUMN public.deal_claims.venue_bill_amount IS
  'Bill total read from the approved venue receipt, entered by staff.';

-- Staff record the total at approval time; riders cannot set it (see the
-- rider update trigger, which rejects changes to non-receipt columns).
CREATE OR REPLACE FUNCTION public.set_venue_bill_amount(p_claim_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'Bill total must be zero or more';
  END IF;
  UPDATE deal_claims SET venue_bill_amount = round(p_amount, 2) WHERE id = p_claim_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_venue_bill_amount(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_venue_bill_amount(uuid, numeric) TO authenticated;

-- Riders must not set bill totals themselves.
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
    IF (OLD.ride_receipt_status = 'approved' AND NEW.ride_receipt_url IS DISTINCT FROM OLD.ride_receipt_url)
      OR (OLD.venue_receipt_status = 'approved' AND NEW.venue_receipt_url IS DISTINCT FROM OLD.venue_receipt_url) THEN
      RAISE EXCEPTION 'This receipt was already approved';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
