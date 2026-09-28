-- Drivers are credited per claim: a rider adds the driver's code to an active
-- claim (link-driver sets deal_claims.referring_driver_id). Sign-up referrals
-- are no longer used, so derive a driver's riders from their linked claims.

-- 1. "total_referrals" = distinct riders who added this driver to a claim.
CREATE OR REPLACE FUNCTION public.get_driver_stats()
RETURNS TABLE (
  total_referrals            bigint,
  total_earnings             decimal,
  payout_balance             decimal,
  completed_claims           bigint,
  stripe_account_id          text,
  stripe_onboarding_complete boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_driver_profile_id uuid;
BEGIN
  SELECT dp.id INTO v_driver_profile_id
  FROM driver_profiles dp WHERE dp.user_id = auth.uid();

  IF v_driver_profile_id IS NULL THEN
    RAISE EXCEPTION 'No driver profile found for user: %', auth.uid();
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(DISTINCT dc.rider_user_id) FROM deal_claims dc
     WHERE dc.referring_driver_id = v_driver_profile_id),
    COALESCE((SELECT sum(t.amount) FROM transactions t
              JOIN deal_claims dc ON dc.id = t.deal_claim_id
              WHERE dc.referring_driver_id = v_driver_profile_id
                AND t.type = 'driver_kickback' AND t.status = 'completed'), 0),
    COALESCE((SELECT sum(t.amount) FROM transactions t
              JOIN deal_claims dc ON dc.id = t.deal_claim_id
              WHERE dc.referring_driver_id = v_driver_profile_id
                AND t.type = 'driver_kickback' AND t.status = 'completed'
                AND dc.driver_kickback_paid = false), 0),
    (SELECT count(*) FROM deal_claims dc
     WHERE dc.referring_driver_id = v_driver_profile_id AND dc.status = 'completed'),
    dp.stripe_account_id,
    dp.stripe_onboarding_complete
  FROM driver_profiles dp WHERE dp.id = v_driver_profile_id;
END;
$$;

-- 2. Riders who added the calling driver's code, newest first. Names are first
--    name + last initial; drivers never see rider emails.
CREATE OR REPLACE FUNCTION public.get_driver_riders()
RETURNS TABLE (
  rider_id           uuid,
  rider_display_name text,
  rides              bigint,
  completed_visits   bigint,
  earned             decimal,
  last_ride_at       timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_driver_profile_id uuid;
BEGIN
  SELECT dp.id INTO v_driver_profile_id
  FROM driver_profiles dp WHERE dp.user_id = auth.uid();

  IF v_driver_profile_id IS NULL THEN
    RAISE EXCEPTION 'No driver profile found for user: %', auth.uid();
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    CASE
      WHEN coalesce(btrim(u.full_name), '') = '' THEN 'Rider'
      WHEN strpos(btrim(u.full_name), ' ') = 0 THEN btrim(u.full_name)
      ELSE split_part(btrim(u.full_name), ' ', 1) || ' '
        || upper(left(regexp_replace(btrim(u.full_name), '^.*\s', ''), 1)) || '.'
    END,
    count(*),
    count(*) FILTER (WHERE dc.status = 'completed'),
    COALESCE(sum(d.driver_kickback_amount) FILTER (WHERE dc.status = 'completed'), 0),
    max(dc.reserved_at)
  FROM deal_claims dc
  JOIN deals d ON d.id = dc.deal_id
  JOIN users u ON u.id = dc.rider_user_id
  WHERE dc.referring_driver_id = v_driver_profile_id
  GROUP BY u.id, u.full_name
  ORDER BY max(dc.reserved_at) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_riders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_riders() TO authenticated;
