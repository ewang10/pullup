-- Venue billing columns
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id text,
  ADD COLUMN IF NOT EXISTS stripe_bank_last4        text,
  ADD COLUMN IF NOT EXISTS stripe_bank_institution  text;
-- Driver cashout lock to prevent double-cashout
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS cashout_in_progress boolean NOT NULL DEFAULT false;
-- Atomic rider balance claim.
-- SELECT ... FOR UPDATE locks the row so concurrent calls cannot both
-- read the same nonzero balance. Returns the balance claimed (0 = nothing to claim).
CREATE OR REPLACE FUNCTION public.claim_rider_cashout_balance(p_rider_profile_id uuid)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE
  v_balance numeric;
BEGIN
  SELECT balance INTO v_balance
  FROM rider_profiles
  WHERE id = p_rider_profile_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE rider_profiles SET balance = 0 WHERE id = p_rider_profile_id;
  RETURN v_balance;
END;
$$;
-- Gate: venue cannot create active deals without a linked bank account.
-- Replaces existing "deals_insert_own_venue" policy (which only checks ownership).
DROP POLICY IF EXISTS "deals_insert_own_venue" ON deals;
CREATE POLICY "deals_insert_own_venue"
  ON deals FOR INSERT
  WITH CHECK (
    venue_id IN (
      SELECT id FROM venues
      WHERE owner_user_id = auth.uid()
        AND stripe_payment_method_id IS NOT NULL
    )
  );
