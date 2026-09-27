-- Enable Supabase Realtime on the deal_claims table so mobile clients
-- receive live updates when any claim is created, updated, or deleted.
ALTER PUBLICATION supabase_realtime ADD TABLE deal_claims;
