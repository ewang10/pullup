-- Venue's typical spend per customer, entered in dashboard Settings.
-- Used only to estimate sales from PullUp visits (completed visits x average
-- bill). Optional; the estimate is hidden until a venue sets it.
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS avg_check_amount numeric(10, 2)
    CHECK (avg_check_amount IS NULL OR (avg_check_amount >= 0 AND avg_check_amount <= 10000));

COMMENT ON COLUMN public.venues.avg_check_amount IS
  'Average bill per customer in USD, entered by the venue; used for estimated sales on the dashboard.';
