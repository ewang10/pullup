-- ============================================================================
-- PullUp Receipt Review, Rider Profiles & RLS Migration
-- ============================================================================
--
-- This migration adds:
--   1. ride_receipt_status column on deal_claims
--   2. rider_profiles table for balance tracking and Stripe Connect
--   3. RLS policies for platform admin/support access
--   4. Updated handle_new_user() trigger to auto-create rider_profiles
--   5. increment_rider_balance() atomic helper function
--
-- Depends on: 00007_platform_admin_and_receipt_status.sql
-- ============================================================================


-- ============================================================================
-- 1. Add ride_receipt_status column to deal_claims
-- ============================================================================

ALTER TABLE deal_claims
  ADD COLUMN ride_receipt_status text
  CHECK (ride_receipt_status IN ('pending_review', 'approved', 'rejected'));
COMMENT ON COLUMN deal_claims.ride_receipt_status
  IS 'Receipt review status: null = no receipt uploaded, pending_review = awaiting admin review, approved = verified, rejected = denied.';
-- ============================================================================
-- 2. Create rider_profiles table
-- ============================================================================

CREATE TABLE rider_profiles (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid        UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance                    numeric     NOT NULL DEFAULT 0,
  stripe_account_id          text,
  stripe_onboarding_complete boolean     NOT NULL DEFAULT false,
  created_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rider_profiles_user_id ON rider_profiles(user_id);
COMMENT ON TABLE rider_profiles
  IS 'Stores rider-specific data: ride credit balance and Stripe Connect payout info.';
-- ============================================================================
-- 3. RLS for rider_profiles
-- ============================================================================

ALTER TABLE rider_profiles ENABLE ROW LEVEL SECURITY;
-- Riders can read their own profile
CREATE POLICY "rider_profiles_select_own"
  ON rider_profiles FOR SELECT
  USING (user_id = auth.uid());
-- Platform admins can read all rider profiles
CREATE POLICY "rider_profiles_select_platform_admin"
  ON rider_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'platform_admin'
    )
  );
-- Platform admins can update all rider profiles
CREATE POLICY "rider_profiles_update_platform_admin"
  ON rider_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'platform_admin'
    )
  );
-- Riders can update their own profile (for Stripe onboarding fields)
CREATE POLICY "rider_profiles_update_own"
  ON rider_profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
-- ============================================================================
-- 4. RLS policies for platform admin/support on deal_claims
-- ============================================================================

-- Platform admins and support can read all deal_claims
CREATE POLICY "deal_claims_select_platform"
  ON deal_claims FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('platform_admin', 'platform_support')
    )
  );
-- Platform admins and support can update all deal_claims (for receipt review)
CREATE POLICY "deal_claims_update_platform"
  ON deal_claims FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('platform_admin', 'platform_support')
    )
  );
-- Platform admins can read all users (for team management & receipt review context)
CREATE POLICY "users_select_platform_admin"
  ON users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('platform_admin', 'platform_support')
    )
  );
-- ============================================================================
-- 5. Update handle_new_user() to also create rider_profiles for riders
-- ============================================================================

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
  v_role      := COALESCE(NEW.raw_user_meta_data ->> 'role', 'rider')::user_role;
  v_full_name := COALESCE(NEW.raw_user_meta_data ->> 'full_name', '');

  INSERT INTO public.users (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, v_full_name, v_role);

  -- Create rider_profiles row for riders
  IF v_role = 'rider' THEN
    INSERT INTO public.rider_profiles (user_id)
    VALUES (NEW.id);
  END IF;

  -- Create driver_profiles row for drivers
  IF v_role = 'driver' THEN
    LOOP
      v_code := '';
      FOR i IN 1..8 LOOP
        v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
      END LOOP;

      BEGIN
        INSERT INTO public.driver_profiles (user_id, referral_code)
        VALUES (NEW.id, v_code)
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
COMMENT ON FUNCTION public.handle_new_user()
  IS 'Auth trigger: provisions public.users, rider_profiles (for riders), and '
     'driver_profiles (for drivers) whenever a new auth.users row is inserted.';
-- ============================================================================
-- 6. increment_rider_balance() — Atomic Balance Update
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_rider_balance(
  p_user_id uuid,
  p_amount  decimal
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be a positive number, got: %', p_amount;
  END IF;

  UPDATE rider_profiles
  SET balance = balance + p_amount
  WHERE user_id = p_user_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Rider profile not found for user: %', p_user_id;
  END IF;
END;
$$;
COMMENT ON FUNCTION public.increment_rider_balance(uuid, decimal)
  IS 'Atomically adds p_amount to the rider balance for the given user. '
     'Raises on invalid input or missing profile.';
-- ============================================================================
-- 7. Backfill rider_profiles for existing riders who don't have one yet
-- ============================================================================

INSERT INTO rider_profiles (user_id)
SELECT id FROM users
WHERE role = 'rider'
  AND id NOT IN (SELECT user_id FROM rider_profiles)
ON CONFLICT (user_id) DO NOTHING;
