-- Staff view of visits still waiting on the rider to upload a required
-- receipt (not yet in the review queue), with their deadlines, so admins can
-- extend a deadline when a rider asks.
CREATE OR REPLACE FUNCTION public.get_receipts_awaiting_upload()
RETURNS TABLE (
  claim_id               uuid,
  completed_at           timestamptz,
  receipt_due_at         timestamptz,
  deal_title             text,
  venue_name             text,
  rider_display_name     text,
  requires_ride_receipt  boolean,
  requires_venue_receipt boolean,
  ride_receipt_status    text,
  venue_receipt_status   text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT dc.id, dc.completed_at, public.receipt_deadline(dc.completed_at, dc.receipt_due_at), d.title, v.name,
    CASE
      WHEN coalesce(btrim(u.full_name), '') = '' THEN 'Rider'
      WHEN strpos(btrim(u.full_name), ' ') = 0 THEN btrim(u.full_name)
      ELSE split_part(btrim(u.full_name), ' ', 1) || ' '
        || upper(left(regexp_replace(btrim(u.full_name), '^.*\s', ''), 1)) || '.'
    END,
    d.requires_ride_receipt, d.requires_venue_receipt, dc.ride_receipt_status, dc.venue_receipt_status
  FROM deal_claims dc
  JOIN deals d  ON d.id = dc.deal_id
  JOIN venues v ON v.id = d.venue_id
  JOIN users u  ON u.id = dc.rider_user_id
  WHERE dc.status = 'completed'
    AND dc.unverified_at IS NULL
    AND dc.ride_credit_paid = false
    AND (
      (d.requires_ride_receipt AND (dc.ride_receipt_status IS NULL OR dc.ride_receipt_status = 'rejected'))
      OR (d.requires_venue_receipt AND (dc.venue_receipt_status IS NULL OR dc.venue_receipt_status = 'rejected'))
    )
  ORDER BY public.receipt_deadline(dc.completed_at, dc.receipt_due_at) ASC
  LIMIT 200;
END;
$$;
REVOKE ALL ON FUNCTION public.get_receipts_awaiting_upload() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_receipts_awaiting_upload() TO authenticated;
