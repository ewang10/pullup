-- ============================================================================
-- Configurable receipt requirements per deal
-- ============================================================================
--
-- Adds two receipt requirement flags to deals:
--   requires_ride_receipt  (default true)  — rider must upload Uber/Lyft screenshot
--   requires_venue_receipt (default false) — rider must upload venue purchase receipt
--
-- Adds venue receipt tracking fields to deal_claims:
--   venue_receipt_url    — storage URL of the uploaded venue receipt
--   venue_receipt_status — review state: pending_review | approved | rejected
--
-- Settlement behaviour (all three settle together, never partially):
--   No receipts required   → settle on venue QR scan (complete-claim)
--   Any receipt required   → settle only when all required receipts are approved
--
-- Depends on: 00027_restore_rider_profiles_creation.sql
-- ============================================================================

-- Receipt requirement flags on deals
ALTER TABLE public.deals
  ADD COLUMN requires_ride_receipt  boolean NOT NULL DEFAULT true,
  ADD COLUMN requires_venue_receipt boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.deals.requires_ride_receipt
  IS 'When true, rider must upload a rideshare receipt to receive their ride credit.';
COMMENT ON COLUMN public.deals.requires_venue_receipt
  IS 'When true, rider must upload a venue purchase receipt before settlement. '
     'Protects venue from scan-and-leave. Venue charge is only processed after approval.';
-- Venue receipt tracking on deal_claims
ALTER TABLE public.deal_claims
  ADD COLUMN venue_receipt_url    text,
  ADD COLUMN venue_receipt_status text
    CHECK (venue_receipt_status IN ('pending_review', 'approved', 'rejected'));
COMMENT ON COLUMN public.deal_claims.venue_receipt_url
  IS 'Storage URL of the venue purchase receipt uploaded by the rider.';
COMMENT ON COLUMN public.deal_claims.venue_receipt_status
  IS 'Review status: null = not uploaded, pending_review = awaiting admin review, '
     'approved = verified, rejected = denied.';
