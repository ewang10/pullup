-- ============================================================================
-- Driver Cashout & Kickback History
-- ============================================================================
--
-- 1. Add stripe_onboarding_complete to driver_profiles
-- 2. driver_transactions table (mirrors rider_transactions)
-- 3. Update get_driver_stats() to include stripe fields
-- 4. Add get_driver_kickback_history() RPC

-- ============================================================================
-- 1. Add stripe_onboarding_complete to driver_profiles
-- ============================================================================

ALTER TABLE driver_profiles
  ADD COLUMN stripe_onboarding_complete boolean NOT NULL DEFAULT false;
-- ============================================================================
-- 2. Driver transactions table
-- ============================================================================

CREATE TABLE driver_transactions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type               text        NOT NULL CHECK (type IN ('cashout')),
  amount             decimal     NOT NULL,
  status             text        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'completed', 'failed')),
  stripe_transfer_id text,
  failure_reason     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_driver_transactions_user_id ON driver_transactions(user_id);
ALTER TABLE driver_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Drivers can view own transactions"
  ON driver_transactions FOR SELECT
  USING (auth.uid() = user_id);
-- ============================================================================
-- 3. Update get_driver_stats() to include stripe fields
-- Must DROP first because the return type is changing (new columns added).
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_driver_stats();
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
    (SELECT count(*) FROM referrals r WHERE r.driver_id = v_driver_profile_id),
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
-- ============================================================================
-- 4. Kickback history RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_driver_kickback_history()
RETURNS TABLE (
  transaction_id uuid,
  venue_name     text,
  amount         decimal,
  kickback_paid  boolean,
  earned_at      timestamptz
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
  SELECT t.id, v.name, t.amount, dc.driver_kickback_paid, t.created_at
  FROM transactions t
  JOIN deal_claims dc ON dc.id = t.deal_claim_id
  JOIN deals d ON d.id = dc.deal_id
  JOIN venues v ON v.id = d.venue_id
  WHERE dc.referring_driver_id = v_driver_profile_id
    AND t.type = 'driver_kickback'
    AND t.status = 'completed'
  ORDER BY t.created_at DESC;
END;
$$;
