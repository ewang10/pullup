-- Use the voided status for visits closed as not verified, and limit the
-- full user list to admins (support uses purpose-built functions instead).

UPDATE public.transactions t
SET status = 'voided'
FROM public.deal_claims dc
WHERE dc.id = t.deal_claim_id
  AND dc.unverified_at IS NOT NULL
  AND t.status = 'failed';

CREATE OR REPLACE FUNCTION public.close_overdue_receipt_claims()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(dc.id) INTO v_ids
  FROM deal_claims dc
  JOIN deals d ON d.id = dc.deal_id
  WHERE dc.status = 'completed'
    AND dc.unverified_at IS NULL
    AND dc.ride_credit_paid = false
    AND (d.requires_ride_receipt OR d.requires_venue_receipt)
    AND public.receipt_deadline(dc.completed_at, dc.receipt_due_at) < now()
    AND NOT (
      (NOT d.requires_ride_receipt OR dc.ride_receipt_status = 'approved')
      AND (NOT d.requires_venue_receipt OR dc.venue_receipt_status = 'approved')
    );

  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE deal_claims SET unverified_at = now() WHERE id = ANY (v_ids);
  UPDATE transactions SET status = 'voided' WHERE deal_claim_id = ANY (v_ids) AND status = 'pending';
  RETURN array_length(v_ids, 1);
END;
$$;
REVOKE ALL ON FUNCTION public.close_overdue_receipt_claims() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "users_select_platform_admin" ON public.users;
CREATE POLICY "users_select_platform_admin"
  ON public.users FOR SELECT
  USING (public.is_admin());
