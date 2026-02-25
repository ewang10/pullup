-- ============================================================================
-- PullUp Auth Trigger & Helper Functions Migration
-- ============================================================================
--
-- This migration adds:
--   1. handle_new_user()        - trigger function on auth.users INSERT
--   2. increment_driver_earnings() - atomic earnings/balance increment
--   3. get_nearby_deals()       - Haversine proximity search for active deals
--   4. get_driver_stats()       - dashboard stats for the current driver
--   5. get_driver_referrals()   - referred riders with claim counts
--
-- Depends on: 00001_initial_schema.sql
-- ============================================================================


-- ============================================================================
-- 1. handle_new_user() — Auth Trigger Function
-- ============================================================================

/**
 * handle_new_user()
 *
 * Trigger function fired AFTER INSERT on auth.users.
 * Automatically provisions a corresponding row in public.users using
 * metadata supplied during sign-up (raw_user_meta_data).
 *
 * If the new user's role is 'driver', a driver_profiles row is also
 * created with a unique 8-character referral code drawn from the
 * alphabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no ambiguous chars).
 *
 * SECURITY DEFINER: Required so the function can write to public.users
 * and public.driver_profiles even though it runs in the auth schema
 * context where the inserting role may lack direct table access.
 */
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role      user_role;
  v_full_name text;
  v_code      text;
  v_chars     text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_profile_id uuid;
  i           integer;
BEGIN
  -- -----------------------------------------------------------------------
  -- Extract metadata supplied by the client during sign-up.
  -- Default to 'rider' when no role is provided.
  -- -----------------------------------------------------------------------
  v_role      := COALESCE(NEW.raw_user_meta_data ->> 'role', 'rider')::user_role;
  v_full_name := COALESCE(NEW.raw_user_meta_data ->> 'full_name', '');

  -- -----------------------------------------------------------------------
  -- Create the public.users row mirroring the auth.users entry.
  -- -----------------------------------------------------------------------
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, v_full_name, v_role);

  -- -----------------------------------------------------------------------
  -- If the user signed up as a driver, provision a driver_profiles row
  -- with a generated 8-character referral code.
  -- -----------------------------------------------------------------------
  IF v_role = 'driver' THEN
    -- Generate an 8-character referral code. Retry on (unlikely) collision
    -- thanks to the UNIQUE constraint on driver_profiles.referral_code.
    LOOP
      v_code := '';
      FOR i IN 1..8 LOOP
        v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
      END LOOP;

      BEGIN
        INSERT INTO public.driver_profiles (user_id, referral_code)
        VALUES (NEW.id, v_code)
        RETURNING id INTO v_profile_id;

        -- Success — exit the retry loop.
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          -- Referral code collision; generate a new one on next iteration.
          NULL;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user()
  IS 'Auth trigger: provisions public.users (and driver_profiles for drivers) '
     'whenever a new auth.users row is inserted.';

-- Trigger on auth.users ---------------------------------------------------
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ============================================================================
-- 2. increment_driver_earnings() — Atomic Balance Update
-- ============================================================================

/**
 * increment_driver_earnings(p_driver_id uuid, p_amount decimal)
 *
 * Atomically increments both total_earnings and payout_balance for the
 * specified driver profile. Intended to be called from server-side logic
 * (e.g., Edge Functions or webhooks) after a deal claim is completed
 * and the driver kickback is confirmed.
 *
 * @param  p_driver_id  The driver_profiles.id to credit.
 * @param  p_amount     The positive decimal amount to add.
 *
 * Raises an exception if:
 *   - p_amount is not positive
 *   - The driver profile does not exist
 *
 * SECURITY DEFINER: This function is meant to be invoked by trusted
 * server-side code, not directly by end users. Wrap with RLS or
 * restrict via API policies as needed.
 */
CREATE OR REPLACE FUNCTION public.increment_driver_earnings(
  p_driver_id uuid,
  p_amount    decimal
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  -- -----------------------------------------------------------------------
  -- Validate input.
  -- -----------------------------------------------------------------------
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be a positive number, got: %', p_amount;
  END IF;

  -- -----------------------------------------------------------------------
  -- Atomic increment of both earnings and balance.
  -- -----------------------------------------------------------------------
  UPDATE driver_profiles
  SET total_earnings = total_earnings + p_amount,
      payout_balance = payout_balance + p_amount
  WHERE id = p_driver_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Driver profile not found: %', p_driver_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.increment_driver_earnings(uuid, decimal)
  IS 'Atomically adds p_amount to total_earnings and payout_balance '
     'for the given driver profile. Raises on invalid input or missing profile.';


-- ============================================================================
-- 3. get_nearby_deals() — Haversine Proximity Search
-- ============================================================================

/**
 * get_nearby_deals(user_lat decimal, user_lng decimal, radius_miles decimal)
 *
 * Returns all active deals whose venue falls within radius_miles of the
 * supplied coordinates, ordered by distance ascending.
 *
 * Uses the Haversine formula with Earth radius = 3959 miles.
 *
 * Each row includes:
 *   - Full deal columns (id, title, description, discount info, etc.)
 *   - Venue metadata (name, address, lat/lng, category)
 *   - Computed distance_miles from the user's position
 *   - Computed slots_remaining for today (reserved + completed vs daily_cap)
 *
 * @param  user_lat      User latitude in decimal degrees.
 * @param  user_lng      User longitude in decimal degrees.
 * @param  radius_miles  Maximum distance in miles.
 *
 * @returns SETOF RECORD — one row per qualifying deal.
 */
CREATE OR REPLACE FUNCTION public.get_nearby_deals(
  user_lat     decimal,
  user_lng     decimal,
  radius_miles decimal DEFAULT 10
)
RETURNS TABLE (
  deal_id                uuid,
  title                  text,
  description            text,
  discount_type          discount_type,
  discount_value         decimal,
  ride_credit_amount     decimal,
  driver_kickback_amount decimal,
  platform_fee_amount    decimal,
  daily_cap              integer,
  hold_duration_minutes  integer,
  deal_created_at        timestamptz,
  venue_id               uuid,
  venue_name             text,
  venue_address          text,
  venue_latitude         decimal,
  venue_longitude        decimal,
  venue_category         venue_category,
  distance_miles         decimal,
  slots_remaining        integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id                    AS deal_id,
    d.title,
    d.description,
    d.discount_type,
    d.discount_value,
    d.ride_credit_amount,
    d.driver_kickback_amount,
    d.platform_fee_amount,
    d.daily_cap,
    d.hold_duration_minutes,
    d.created_at            AS deal_created_at,
    v.id                    AS venue_id,
    v.name                  AS venue_name,
    v.address               AS venue_address,
    v.latitude              AS venue_latitude,
    v.longitude             AS venue_longitude,
    v.category              AS venue_category,
    -- -----------------------------------------------------------------
    -- Haversine formula (Earth radius = 3959 miles)
    -- -----------------------------------------------------------------
    (
      3959 * acos(
        LEAST(1.0,                         -- clamp to avoid NaN from floating-point drift
          cos(radians(user_lat))
          * cos(radians(v.latitude))
          * cos(radians(v.longitude) - radians(user_lng))
          + sin(radians(user_lat))
          * sin(radians(v.latitude))
        )
      )
    )::decimal               AS distance_miles,
    -- -----------------------------------------------------------------
    -- Slots remaining today (UTC day boundary)
    -- -----------------------------------------------------------------
    GREATEST(
      d.daily_cap - (
        SELECT count(*)::integer
        FROM deal_claims dc
        WHERE dc.deal_id = d.id
          AND dc.status IN ('reserved', 'completed')
          AND dc.reserved_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
          AND dc.reserved_at <  date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day'
      ),
      0
    )::integer               AS slots_remaining
  FROM deals d
  JOIN venues v ON v.id = d.venue_id
  WHERE d.is_active = true
    AND v.latitude  IS NOT NULL
    AND v.longitude IS NOT NULL
    -- Pre-filter: only compute full Haversine for rows within bounding box
    AND (
      3959 * acos(
        LEAST(1.0,
          cos(radians(user_lat))
          * cos(radians(v.latitude))
          * cos(radians(v.longitude) - radians(user_lng))
          + sin(radians(user_lat))
          * sin(radians(v.latitude))
        )
      )
    ) <= radius_miles
  ORDER BY distance_miles ASC;
END;
$$;

COMMENT ON FUNCTION public.get_nearby_deals(decimal, decimal, decimal)
  IS 'Returns active deals within radius_miles of (user_lat, user_lng) using '
     'the Haversine formula. Includes venue info, computed distance, and '
     'today''s remaining slots.';


-- ============================================================================
-- 4. get_driver_stats() — Driver Dashboard Statistics
-- ============================================================================

/**
 * get_driver_stats()
 *
 * Returns aggregate statistics for the currently authenticated driver.
 * Requires the caller to be an authenticated Supabase user whose
 * public.users row has role = 'driver'.
 *
 * Returned columns:
 *   - total_referrals   : count of riders referred by this driver
 *   - total_earnings    : lifetime accumulated earnings (decimal)
 *   - payout_balance    : current un-withdrawn balance (decimal)
 *   - completed_claims  : number of deal claims where this driver was
 *                         the referrer and status = 'completed'
 *
 * Raises an exception if no driver_profiles row exists for auth.uid().
 */
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
  -- -----------------------------------------------------------------------
  -- Resolve the driver_profiles row for the current auth user.
  -- -----------------------------------------------------------------------
  SELECT dp.id INTO v_driver_profile_id
  FROM driver_profiles dp
  WHERE dp.user_id = auth.uid();

  IF v_driver_profile_id IS NULL THEN
    RAISE EXCEPTION 'No driver profile found for user: %', auth.uid();
  END IF;

  -- -----------------------------------------------------------------------
  -- Return a single-row result with aggregated stats.
  -- -----------------------------------------------------------------------
  RETURN QUERY
  SELECT
    -- Total riders referred by this driver
    (
      SELECT count(*)
      FROM referrals r
      WHERE r.driver_id = v_driver_profile_id
    )                                AS total_referrals,

    -- Lifetime earnings
    dp.total_earnings                AS total_earnings,

    -- Current payout balance
    dp.payout_balance                AS payout_balance,

    -- Completed claims where this driver was the referrer
    (
      SELECT count(*)
      FROM deal_claims dc
      WHERE dc.referring_driver_id = v_driver_profile_id
        AND dc.status = 'completed'
    )                                AS completed_claims

  FROM driver_profiles dp
  WHERE dp.id = v_driver_profile_id;
END;
$$;

COMMENT ON FUNCTION public.get_driver_stats()
  IS 'Returns dashboard stats (total_referrals, total_earnings, payout_balance, '
     'completed_claims) for the currently authenticated driver.';


-- ============================================================================
-- 5. get_driver_referrals() — Referred Riders with Claim Counts
-- ============================================================================

/**
 * get_driver_referrals()
 *
 * Returns a list of riders referred by the currently authenticated driver,
 * along with each rider's total number of deal claims.
 *
 * Returned columns:
 *   - id           : referrals.id
 *   - rider_name   : users.full_name of the referred rider
 *   - rider_email  : users.email of the referred rider
 *   - total_claims : count of deal_claims by this rider
 *   - joined_at    : referrals.created_at (when the referral was recorded)
 *
 * Raises an exception if no driver_profiles row exists for auth.uid().
 */
CREATE OR REPLACE FUNCTION public.get_driver_referrals()
RETURNS TABLE (
  id           uuid,
  rider_name   text,
  rider_email  text,
  total_claims bigint,
  joined_at    timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_profile_id uuid;
BEGIN
  -- -----------------------------------------------------------------------
  -- Resolve the driver_profiles row for the current auth user.
  -- -----------------------------------------------------------------------
  SELECT dp.id INTO v_driver_profile_id
  FROM driver_profiles dp
  WHERE dp.user_id = auth.uid();

  IF v_driver_profile_id IS NULL THEN
    RAISE EXCEPTION 'No driver profile found for user: %', auth.uid();
  END IF;

  -- -----------------------------------------------------------------------
  -- Return referred riders with their claim counts.
  -- -----------------------------------------------------------------------
  RETURN QUERY
  SELECT
    ref.id                           AS id,
    u.full_name                      AS rider_name,
    u.email                          AS rider_email,
    (
      SELECT count(*)
      FROM deal_claims dc
      WHERE dc.rider_user_id = ref.rider_user_id
    )                                AS total_claims,
    ref.created_at                   AS joined_at
  FROM referrals ref
  JOIN users u ON u.id = ref.rider_user_id
  WHERE ref.driver_id = v_driver_profile_id
  ORDER BY ref.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_driver_referrals()
  IS 'Returns referred riders (name, email, total_claims, joined_at) '
     'for the currently authenticated driver.';
