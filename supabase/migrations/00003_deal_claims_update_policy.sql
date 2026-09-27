-- Allow riders to cancel their own claims (update status to 'cancelled').
CREATE POLICY "deal_claims_update_rider"
  ON deal_claims FOR UPDATE
  USING (rider_user_id = auth.uid())
  WITH CHECK (rider_user_id = auth.uid());
