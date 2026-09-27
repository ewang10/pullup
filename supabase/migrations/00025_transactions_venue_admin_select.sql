-- Allow venue admins to read transactions for claims on their venue's deals.
-- Without this policy, the billing page query is blocked by RLS and shows no transactions.
CREATE POLICY "transactions_select_venue_admin"
  ON transactions FOR SELECT
  USING (
    deal_claim_id IN (
      SELECT dc.id FROM deal_claims dc
      JOIN deals d ON d.id = dc.deal_id
      JOIN venues v ON v.id = d.venue_id
      WHERE v.owner_user_id = auth.uid()
    )
  );
