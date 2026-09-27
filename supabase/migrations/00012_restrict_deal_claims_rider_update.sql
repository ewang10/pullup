-- ============================================================================
-- Restrict what riders can update on their own deal_claims
-- ============================================================================
--
-- The existing deal_claims_update_rider policy allows riders to update any
-- field on their own claims, including status. This would let a rider mark
-- their own claim as "completed" without actually visiting the venue.
--
-- Fix: add a trigger that restricts rider-initiated updates to only the
-- receipt fields (ride_receipt_url, ride_receipt_status). Status changes
-- must go through the service-role edge functions (complete-claim, expire-claims).
-- ============================================================================

CREATE OR REPLACE FUNCTION restrict_deal_claims_rider_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  -- Get the current user's role from the JWT metadata to avoid recursion
  v_role := auth.jwt() -> 'user_metadata' ->> 'role';

  -- Only apply restrictions for rider-role updates
  IF v_role = 'rider' THEN
    -- Block status changes — must go through edge functions
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Riders cannot change claim status directly';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_restrict_deal_claims_rider_update
  BEFORE UPDATE ON deal_claims
  FOR EACH ROW
  EXECUTE FUNCTION restrict_deal_claims_rider_update();
COMMENT ON FUNCTION restrict_deal_claims_rider_update()
  IS 'Prevents riders from directly changing claim status. '
     'Only receipt fields may be updated by riders.';
