-- Rider transactions table for tracking cashouts (separate from claim-level transactions)
CREATE TABLE rider_transactions (
  id                uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid               NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type              text               NOT NULL CHECK (type IN ('cashout')),
  amount            decimal            NOT NULL,
  status            text               NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  stripe_transfer_id text,
  stripe_payout_id   text,
  failure_reason     text,
  created_at        timestamptz        NOT NULL DEFAULT now(),
  updated_at        timestamptz        NOT NULL DEFAULT now()
);
CREATE INDEX idx_rider_transactions_user_id ON rider_transactions(user_id);
CREATE INDEX idx_rider_transactions_stripe_transfer_id ON rider_transactions(stripe_transfer_id);
-- RLS
ALTER TABLE rider_transactions ENABLE ROW LEVEL SECURITY;
-- Riders can read their own transactions
CREATE POLICY "Riders can view own transactions"
  ON rider_transactions FOR SELECT
  USING (auth.uid() = user_id);
