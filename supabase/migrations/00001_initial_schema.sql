-- ============================================================================
-- PullUp Initial Schema Migration
-- ============================================================================

-- ============================================================================
-- 1. Custom Enum Types
-- ============================================================================

CREATE TYPE user_role AS ENUM ('rider', 'driver', 'venue_admin');

CREATE TYPE venue_category AS ENUM (
  'restaurant', 'bar', 'nightclub', 'attraction', 'experience', 'dispensary', 'other'
);

CREATE TYPE discount_type AS ENUM ('percentage', 'fixed_amount');

CREATE TYPE claim_status AS ENUM ('reserved', 'completed', 'expired', 'cancelled');

CREATE TYPE transaction_type AS ENUM (
  'venue_charge', 'ride_reimbursement', 'driver_kickback', 'platform_fee'
);

CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed');


-- ============================================================================
-- 2. Tables
-- ============================================================================

-- Users -----------------------------------------------------------------
CREATE TABLE users (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        UNIQUE NOT NULL,
  phone      text,
  full_name  text        NOT NULL,
  role       user_role   NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Driver Profiles -------------------------------------------------------
CREATE TABLE driver_profiles (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_code     text        UNIQUE NOT NULL,
  total_earnings    decimal     NOT NULL DEFAULT 0,
  payout_balance    decimal     NOT NULL DEFAULT 0,
  stripe_account_id text,
  is_verified       boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Venues ----------------------------------------------------------------
CREATE TABLE venues (
  id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id     uuid           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              text           NOT NULL,
  description       text,
  category          venue_category NOT NULL,
  address           text           NOT NULL,
  city              text           NOT NULL,
  state             text           NOT NULL,
  latitude          decimal,
  longitude         decimal,
  image_url         text,
  stripe_customer_id text,
  is_active         boolean        NOT NULL DEFAULT true,
  created_at        timestamptz    NOT NULL DEFAULT now()
);

-- Deals -----------------------------------------------------------------
CREATE TABLE deals (
  id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id               uuid          NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  title                  text          NOT NULL,
  description            text,
  discount_type          discount_type NOT NULL,
  discount_value         decimal       NOT NULL,
  ride_credit_amount     decimal       NOT NULL,
  driver_kickback_amount decimal       NOT NULL,
  platform_fee_amount    decimal       NOT NULL,
  daily_cap              integer       NOT NULL,
  hold_duration_minutes  integer       NOT NULL DEFAULT 120,
  is_active              boolean       NOT NULL DEFAULT true,
  created_at             timestamptz   NOT NULL DEFAULT now()
);

-- Deal Claims -----------------------------------------------------------
CREATE TABLE deal_claims (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id               uuid         NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  rider_user_id         uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referring_driver_id   uuid         REFERENCES driver_profiles(id) ON DELETE SET NULL,
  status                claim_status NOT NULL DEFAULT 'reserved',
  reserved_at           timestamptz  NOT NULL DEFAULT now(),
  expires_at            timestamptz  NOT NULL,
  completed_at          timestamptz,
  ride_receipt_url      text,
  ride_receipt_verified boolean      NOT NULL DEFAULT false,
  ride_credit_paid      boolean      NOT NULL DEFAULT false,
  driver_kickback_paid  boolean      NOT NULL DEFAULT false,
  venue_charged         boolean      NOT NULL DEFAULT false,
  created_at            timestamptz  NOT NULL DEFAULT now()
);

-- Transactions ----------------------------------------------------------
CREATE TABLE transactions (
  id                uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_claim_id     uuid               NOT NULL REFERENCES deal_claims(id) ON DELETE CASCADE,
  type              transaction_type   NOT NULL,
  amount            decimal            NOT NULL,
  stripe_payment_id text,
  status            transaction_status NOT NULL DEFAULT 'pending',
  created_at        timestamptz        NOT NULL DEFAULT now()
);

-- Referrals -------------------------------------------------------------
CREATE TABLE referrals (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id          uuid        NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  rider_user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_code_used text        NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);


-- ============================================================================
-- 3. Indexes
-- ============================================================================

-- driver_profiles
CREATE INDEX idx_driver_profiles_user_id       ON driver_profiles(user_id);
CREATE INDEX idx_driver_profiles_referral_code  ON driver_profiles(referral_code);

-- venues
CREATE INDEX idx_venues_owner_user_id ON venues(owner_user_id);
CREATE INDEX idx_venues_is_active     ON venues(is_active);
CREATE INDEX idx_venues_category      ON venues(category);
CREATE INDEX idx_venues_city_state    ON venues(city, state);

-- deals
CREATE INDEX idx_deals_venue_id  ON deals(venue_id);
CREATE INDEX idx_deals_is_active ON deals(is_active);

-- deal_claims
CREATE INDEX idx_deal_claims_deal_id             ON deal_claims(deal_id);
CREATE INDEX idx_deal_claims_rider_user_id       ON deal_claims(rider_user_id);
CREATE INDEX idx_deal_claims_referring_driver_id  ON deal_claims(referring_driver_id);
CREATE INDEX idx_deal_claims_status              ON deal_claims(status);
CREATE INDEX idx_deal_claims_expires_at          ON deal_claims(expires_at);

-- transactions
CREATE INDEX idx_transactions_deal_claim_id ON transactions(deal_claim_id);
CREATE INDEX idx_transactions_type          ON transactions(type);
CREATE INDEX idx_transactions_status        ON transactions(status);

-- referrals
CREATE INDEX idx_referrals_driver_id     ON referrals(driver_id);
CREATE INDEX idx_referrals_rider_user_id ON referrals(rider_user_id);


-- ============================================================================
-- 4. Row Level Security (RLS)
-- ============================================================================

ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues          ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_claims     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals       ENABLE ROW LEVEL SECURITY;

-- ---- users ---------------------------------------------------------------

CREATE POLICY "users_select_own"
  ON users FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "users_update_own"
  ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ---- driver_profiles -----------------------------------------------------

CREATE POLICY "driver_profiles_select_own"
  ON driver_profiles FOR SELECT
  USING (user_id = auth.uid());

-- ---- venues --------------------------------------------------------------

-- Everyone can read active venues.
CREATE POLICY "venues_select_active"
  ON venues FOR SELECT
  USING (is_active = true);

-- Venue admins can read all their venues (including inactive).
CREATE POLICY "venues_select_own"
  ON venues FOR SELECT
  USING (owner_user_id = auth.uid());

-- Venue admins can insert their own venues.
CREATE POLICY "venues_insert_own"
  ON venues FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

-- Venue admins can update their own venues.
CREATE POLICY "venues_update_own"
  ON venues FOR UPDATE
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- Venue admins can delete their own venues.
CREATE POLICY "venues_delete_own"
  ON venues FOR DELETE
  USING (owner_user_id = auth.uid());

-- ---- deals ---------------------------------------------------------------

-- Everyone can read active deals.
CREATE POLICY "deals_select_active"
  ON deals FOR SELECT
  USING (is_active = true);

-- Venue admins can read all deals for their venues (including inactive).
CREATE POLICY "deals_select_own_venue"
  ON deals FOR SELECT
  USING (
    venue_id IN (
      SELECT id FROM venues WHERE owner_user_id = auth.uid()
    )
  );

-- Venue admins can insert deals for their venues.
CREATE POLICY "deals_insert_own_venue"
  ON deals FOR INSERT
  WITH CHECK (
    venue_id IN (
      SELECT id FROM venues WHERE owner_user_id = auth.uid()
    )
  );

-- Venue admins can update deals for their venues.
CREATE POLICY "deals_update_own_venue"
  ON deals FOR UPDATE
  USING (
    venue_id IN (
      SELECT id FROM venues WHERE owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    venue_id IN (
      SELECT id FROM venues WHERE owner_user_id = auth.uid()
    )
  );

-- Venue admins can delete deals for their venues.
CREATE POLICY "deals_delete_own_venue"
  ON deals FOR DELETE
  USING (
    venue_id IN (
      SELECT id FROM venues WHERE owner_user_id = auth.uid()
    )
  );

-- ---- deal_claims ---------------------------------------------------------

-- Riders can read their own claims.
CREATE POLICY "deal_claims_select_rider"
  ON deal_claims FOR SELECT
  USING (rider_user_id = auth.uid());

-- Riders can insert new claims.
CREATE POLICY "deal_claims_insert_rider"
  ON deal_claims FOR INSERT
  WITH CHECK (rider_user_id = auth.uid());

-- Venue admins can read claims for deals belonging to their venues.
CREATE POLICY "deal_claims_select_venue_admin"
  ON deal_claims FOR SELECT
  USING (
    deal_id IN (
      SELECT d.id FROM deals d
      JOIN venues v ON v.id = d.venue_id
      WHERE v.owner_user_id = auth.uid()
    )
  );

-- ---- transactions --------------------------------------------------------

-- Users can read transactions related to their own claims.
CREATE POLICY "transactions_select_own_claims"
  ON transactions FOR SELECT
  USING (
    deal_claim_id IN (
      SELECT id FROM deal_claims WHERE rider_user_id = auth.uid()
    )
  );

-- ---- referrals -----------------------------------------------------------

-- Drivers can read their own referrals.
CREATE POLICY "referrals_select_own"
  ON referrals FOR SELECT
  USING (
    driver_id IN (
      SELECT id FROM driver_profiles WHERE user_id = auth.uid()
    )
  );


-- ============================================================================
-- 5. Auto-expire Claims
-- ============================================================================

-- NOTE: For production, a Supabase pg_cron job is the recommended approach for
-- expiring claims. Schedule the following to run every minute:
--
--   SELECT cron.schedule(
--     'expire-stale-claims',
--     '* * * * *',
--     $$UPDATE deal_claims
--       SET status = 'expired'
--       WHERE status = 'reserved'
--         AND expires_at < now()$$
--   );
--
-- The function below provides the same logic and can be called on-demand or
-- wrapped in a trigger if you prefer a trigger-based approach.

CREATE OR REPLACE FUNCTION expire_stale_claims()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rows_affected integer;
BEGIN
  UPDATE deal_claims
    SET status = 'expired'
  WHERE status = 'reserved'
    AND expires_at < now();

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected;
END;
$$;

COMMENT ON FUNCTION expire_stale_claims()
  IS 'Marks all reserved claims past their expires_at as expired. '
     'Best invoked via pg_cron on a 1-minute schedule.';


-- ============================================================================
-- 6. Daily Slot Availability Check
-- ============================================================================

-- Returns the number of remaining slots for a given deal today.
-- A slot is considered consumed if the claim status is reserved or completed.
CREATE OR REPLACE FUNCTION get_deal_slots_remaining(p_deal_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_daily_cap   integer;
  v_claimed     integer;
BEGIN
  SELECT daily_cap INTO v_daily_cap
  FROM deals
  WHERE id = p_deal_id;

  IF v_daily_cap IS NULL THEN
    RAISE EXCEPTION 'Deal not found: %', p_deal_id;
  END IF;

  SELECT count(*)::integer INTO v_claimed
  FROM deal_claims
  WHERE deal_id = p_deal_id
    AND status IN ('reserved', 'completed')
    AND reserved_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
    AND reserved_at <  date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day';

  RETURN GREATEST(v_daily_cap - v_claimed, 0);
END;
$$;

COMMENT ON FUNCTION get_deal_slots_remaining(uuid)
  IS 'Returns the number of remaining claim slots for a deal today (UTC). '
     'Counts reserved and completed claims against the daily cap.';
