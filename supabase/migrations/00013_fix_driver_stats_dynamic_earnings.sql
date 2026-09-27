-- Fix get_driver_stats to compute earnings dynamically from transactions
-- instead of reading from stored columns that only update via Stripe webhooks.
--
-- total_earnings  = sum of all completed driver_kickback transactions
-- payout_balance  = sum of completed kickbacks where driver_kickback_paid = false
-- (i.e. earned but not yet cashed out)

CREATE OR REPLACE FUNCTION public.get_driver_stats()
RETURNS TABLE (
  total_referrals  bigint,
  total_earnings   decimal,
  payout_balance   decimal,
  completed_claims bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_profile_id uuid;
BEGIN
  SELECT dp.id INTO v_driver_profile_id
  FROM driver_profiles dp
  WHERE dp.user_id = auth.uid();

  IF v_driver_profile_id IS NULL THEN
    RAISE EXCEPTION 'No driver profile found for user: %', auth.uid();
  END IF;

  RETURN QUERY
  SELECT
    -- Total riders referred (legacy referrals table)
    (
      SELECT count(*)
      FROM referrals r
      WHERE r.driver_id = v_driver_profile_id
    ) AS total_referrals,

    -- Lifetime earnings: sum of completed driver_kickback transactions
    COALESCE((
      SELECT sum(t.amount)
      FROM transactions t
      JOIN deal_claims dc ON dc.id = t.deal_claim_id
      WHERE dc.referring_driver_id = v_driver_profile_id
        AND t.type = 'driver_kickback'
        AND t.status = 'completed'
    ), 0) AS total_earnings,

    -- Payout balance: completed kickbacks not yet paid out
    COALESCE((
      SELECT sum(t.amount)
      FROM transactions t
      JOIN deal_claims dc ON dc.id = t.deal_claim_id
      WHERE dc.referring_driver_id = v_driver_profile_id
        AND t.type = 'driver_kickback'
        AND t.status = 'completed'
        AND dc.driver_kickback_paid = false
    ), 0) AS payout_balance,

    -- Completed claims where this driver was the referrer
    (
      SELECT count(*)
      FROM deal_claims dc
      WHERE dc.referring_driver_id = v_driver_profile_id
        AND dc.status = 'completed'
    ) AS completed_claims

  FROM driver_profiles dp
  WHERE dp.id = v_driver_profile_id;
END;
$$;
