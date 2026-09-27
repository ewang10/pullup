-- Track which driver cashout paid each claim's kickback.
-- Allows precise reversal on payout failure (only reset claims from the failed cashout).

ALTER TABLE deal_claims
  ADD COLUMN driver_transaction_id uuid REFERENCES driver_transactions(id) ON DELETE SET NULL;
CREATE INDEX idx_deal_claims_driver_transaction_id ON deal_claims(driver_transaction_id);
