-- Track whether a venue's deals are suspended due to a payment failure.
-- Set to true by the payment_intent.payment_failed webhook.
-- Cleared to false by the payment_intent.succeeded webhook after a successful retry.
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS payment_suspended boolean NOT NULL DEFAULT false;
-- Tighten the deals UPDATE policy:
-- Venue admins can still deactivate deals and edit deal details during suspension,
-- but they cannot set is_active = true while payment_suspended = true.
DROP POLICY IF EXISTS "deals_update_own_venue" ON public.deals;
CREATE POLICY "deals_update_own_venue"
  ON public.deals FOR UPDATE
  USING (
    venue_id IN (
      SELECT id FROM public.venues WHERE owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    venue_id IN (
      SELECT id FROM public.venues
      WHERE owner_user_id = auth.uid()
        AND (payment_suspended = false OR is_active = false)
    )
  );
