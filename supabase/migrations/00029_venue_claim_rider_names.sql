-- Let venue admins see who claimed their deals without exposing rider profiles.
--
-- Venue admins cannot SELECT from users (RLS), so the dashboard showed every
-- rider as "Anonymous". This returns only a display name (first name + last
-- initial, e.g. "Maya C.") and only for claims on venues the caller owns.

CREATE OR REPLACE FUNCTION public.get_venue_claim_rider_names(claim_ids uuid[])
RETURNS TABLE (claim_id uuid, rider_display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dc.id,
    CASE
      WHEN coalesce(btrim(u.full_name), '') = '' THEN 'Rider'
      WHEN strpos(btrim(u.full_name), ' ') = 0 THEN btrim(u.full_name)
      ELSE split_part(btrim(u.full_name), ' ', 1) || ' '
        || upper(left(regexp_replace(btrim(u.full_name), '^.*\s', ''), 1)) || '.'
    END
  FROM deal_claims dc
  JOIN deals d  ON d.id = dc.deal_id
  JOIN venues v ON v.id = d.venue_id
  JOIN users u  ON u.id = dc.rider_user_id
  WHERE dc.id = ANY (claim_ids)
    AND v.owner_user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_venue_claim_rider_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_venue_claim_rider_names(uuid[]) TO authenticated;
