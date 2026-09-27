-- Fix slots_remaining to not count expired reserved claims.
-- A claim with status='reserved' but expires_at < now() is effectively expired
-- even if its status hasn't been updated yet.
CREATE OR REPLACE FUNCTION public.get_nearby_deals(
  user_lat     decimal,
  user_lng     decimal,
  radius_miles decimal DEFAULT 10
)
RETURNS TABLE (
  deal_id                uuid,
  title                  text,
  description            text,
  discount_type          discount_type,
  discount_value         decimal,
  ride_credit_amount     decimal,
  driver_kickback_amount decimal,
  platform_fee_amount    decimal,
  daily_cap              integer,
  hold_duration_minutes  integer,
  deal_created_at        timestamptz,
  venue_id               uuid,
  venue_name             text,
  venue_address          text,
  venue_latitude         decimal,
  venue_longitude        decimal,
  venue_category         venue_category,
  distance_miles         decimal,
  slots_remaining        integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id                    AS deal_id,
    d.title,
    d.description,
    d.discount_type,
    d.discount_value,
    d.ride_credit_amount,
    d.driver_kickback_amount,
    d.platform_fee_amount,
    d.daily_cap,
    d.hold_duration_minutes,
    d.created_at            AS deal_created_at,
    v.id                    AS venue_id,
    v.name                  AS venue_name,
    v.address               AS venue_address,
    v.latitude              AS venue_latitude,
    v.longitude             AS venue_longitude,
    v.category              AS venue_category,
    (
      3959 * acos(
        LEAST(1.0,
          cos(radians(user_lat))
          * cos(radians(v.latitude))
          * cos(radians(v.longitude) - radians(user_lng))
          + sin(radians(user_lat))
          * sin(radians(v.latitude))
        )
      )
    )::decimal               AS distance_miles,
    GREATEST(
      d.daily_cap - (
        SELECT count(*)::integer
        FROM deal_claims dc
        WHERE dc.deal_id = d.id
          AND (
            -- Count completed claims
            dc.status = 'completed'
            OR
            -- Count reserved claims only if not expired
            (dc.status = 'reserved' AND dc.expires_at > now())
          )
          AND dc.reserved_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
          AND dc.reserved_at <  date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day'
      ),
      0
    )::integer               AS slots_remaining
  FROM deals d
  JOIN venues v ON v.id = d.venue_id
  WHERE d.is_active = true
    AND v.latitude  IS NOT NULL
    AND v.longitude IS NOT NULL
    AND (
      3959 * acos(
        LEAST(1.0,
          cos(radians(user_lat))
          * cos(radians(v.latitude))
          * cos(radians(v.longitude) - radians(user_lng))
          + sin(radians(user_lat))
          * sin(radians(v.latitude))
        )
      )
    ) <= radius_miles
  ORDER BY distance_miles ASC;
END;
$$;
