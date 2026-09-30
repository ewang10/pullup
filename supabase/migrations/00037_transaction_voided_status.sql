-- Charges for visits closed without approved receipts are voided, not
-- failed: "failed" means a payment attempt failed and may be retried
-- (retry-venue-payment), while a voided charge must never be collected.
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'voided';
