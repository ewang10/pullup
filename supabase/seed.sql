-- ============================================================================
-- PullUp Test Seed Data
-- ============================================================================
-- Run this in the Supabase SQL Editor to populate test data.
-- It uses your existing venue and deals — just creates test riders,
-- drivers, claims, and transactions so you can see the full dashboard.
--
-- Safe to run multiple times (uses ON CONFLICT DO NOTHING).
-- ============================================================================

-- 1. Create test rider and driver users
-- (These are DB-only users for testing — they don't have Supabase Auth logins)

INSERT INTO users (id, email, full_name, role) VALUES
  ('aaaaaaaa-0001-4000-8000-000000000001', 'rider1@test.com',  'Alice Johnson',  'rider'),
  ('aaaaaaaa-0001-4000-8000-000000000002', 'rider2@test.com',  'Bob Smith',      'rider'),
  ('aaaaaaaa-0001-4000-8000-000000000003', 'rider3@test.com',  'Carol Williams', 'rider'),
  ('aaaaaaaa-0001-4000-8000-000000000004', 'rider4@test.com',  'Dan Brown',      'rider'),
  ('aaaaaaaa-0001-4000-8000-000000000005', 'rider5@test.com',  'Eve Davis',      'rider'),
  ('aaaaaaaa-0001-4000-8000-000000000006', 'driver1@test.com', 'Frank Miller',   'driver'),
  ('aaaaaaaa-0001-4000-8000-000000000007', 'driver2@test.com', 'Grace Lee',      'driver')
ON CONFLICT (id) DO NOTHING;

-- 2. Create driver profiles with referral codes

INSERT INTO driver_profiles (id, user_id, referral_code, total_earnings, payout_balance) VALUES
  ('bbbbbbbb-0001-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000006', 'FRANK123', 48.00, 12.00),
  ('bbbbbbbb-0001-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000007', 'GRACE456', 24.00,  8.00)
ON CONFLICT (id) DO NOTHING;

-- 3. Create deal claims against your first deal
-- (This dynamically picks the first active deal belonging to the first venue)

DO $$
DECLARE
  v_deal_id uuid;
  v_venue_id uuid;
  v_ride_credit decimal;
  v_driver_kickback decimal;
  v_platform_fee decimal;
  v_claim1 uuid := 'cccccccc-0001-4000-8000-000000000001';
  v_claim2 uuid := 'cccccccc-0001-4000-8000-000000000002';
  v_claim3 uuid := 'cccccccc-0001-4000-8000-000000000003';
  v_claim4 uuid := 'cccccccc-0001-4000-8000-000000000004';
  v_claim5 uuid := 'cccccccc-0001-4000-8000-000000000005';
  v_claim6 uuid := 'cccccccc-0001-4000-8000-000000000006';
  v_claim7 uuid := 'cccccccc-0001-4000-8000-000000000007';
  v_claim8 uuid := 'cccccccc-0001-4000-8000-000000000008';
BEGIN
  -- Find the first active deal
  SELECT d.id, d.venue_id, d.ride_credit_amount, d.driver_kickback_amount, d.platform_fee_amount
  INTO v_deal_id, v_venue_id, v_ride_credit, v_driver_kickback, v_platform_fee
  FROM deals d
  WHERE d.is_active = true
  ORDER BY d.created_at ASC
  LIMIT 1;

  IF v_deal_id IS NULL THEN
    RAISE NOTICE 'No active deals found. Create a deal first, then re-run this script.';
    RETURN;
  END IF;

  RAISE NOTICE 'Seeding claims for deal: %', v_deal_id;

  -- Completed claims (from the past week)
  INSERT INTO deal_claims (id, deal_id, rider_user_id, referring_driver_id, status, reserved_at, expires_at, completed_at, venue_charged)
  VALUES
    (v_claim1, v_deal_id, 'aaaaaaaa-0001-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000001', 'completed',
     now() - interval '6 days', now() - interval '6 days' + interval '2 hours', now() - interval '6 days' + interval '1 hour', true),
    (v_claim2, v_deal_id, 'aaaaaaaa-0001-4000-8000-000000000002', 'bbbbbbbb-0001-4000-8000-000000000001', 'completed',
     now() - interval '5 days', now() - interval '5 days' + interval '2 hours', now() - interval '5 days' + interval '45 minutes', true),
    (v_claim3, v_deal_id, 'aaaaaaaa-0001-4000-8000-000000000003', 'bbbbbbbb-0001-4000-8000-000000000002', 'completed',
     now() - interval '4 days', now() - interval '4 days' + interval '2 hours', now() - interval '4 days' + interval '30 minutes', true),
    (v_claim4, v_deal_id, 'aaaaaaaa-0001-4000-8000-000000000004', NULL, 'completed',
     now() - interval '3 days', now() - interval '3 days' + interval '2 hours', now() - interval '3 days' + interval '50 minutes', true),
    (v_claim5, v_deal_id, 'aaaaaaaa-0001-4000-8000-000000000005', 'bbbbbbbb-0001-4000-8000-000000000001', 'completed',
     now() - interval '2 days', now() - interval '2 days' + interval '2 hours', now() - interval '2 days' + interval '40 minutes', true),
    -- Expired claim
    (v_claim6, v_deal_id, 'aaaaaaaa-0001-4000-8000-000000000001', NULL, 'expired',
     now() - interval '1 day', now() - interval '1 day' + interval '2 hours', NULL, false),
    -- Currently reserved (active) claims
    (v_claim7, v_deal_id, 'aaaaaaaa-0001-4000-8000-000000000002', 'bbbbbbbb-0001-4000-8000-000000000002', 'reserved',
     now() - interval '30 minutes', now() + interval '90 minutes', NULL, false),
    -- Cancelled claim
    (v_claim8, v_deal_id, 'aaaaaaaa-0001-4000-8000-000000000003', NULL, 'cancelled',
     now() - interval '1 day 3 hours', now() - interval '1 day 1 hour', NULL, false)
  ON CONFLICT (id) DO NOTHING;

  -- 4. Create transactions for completed claims
  INSERT INTO transactions (id, deal_claim_id, type, amount, status, created_at) VALUES
    -- Claim 1 transactions
    ('dddddddd-0001-4000-8000-000000000001', v_claim1, 'venue_charge',       v_ride_credit + v_driver_kickback + v_platform_fee, 'completed', now() - interval '6 days'),
    ('dddddddd-0001-4000-8000-000000000002', v_claim1, 'ride_reimbursement', v_ride_credit,      'completed', now() - interval '6 days'),
    ('dddddddd-0001-4000-8000-000000000003', v_claim1, 'driver_kickback',   v_driver_kickback,   'completed', now() - interval '6 days'),
    ('dddddddd-0001-4000-8000-000000000004', v_claim1, 'platform_fee',      v_platform_fee,      'completed', now() - interval '6 days'),
    -- Claim 2 transactions
    ('dddddddd-0001-4000-8000-000000000005', v_claim2, 'venue_charge',       v_ride_credit + v_driver_kickback + v_platform_fee, 'completed', now() - interval '5 days'),
    ('dddddddd-0001-4000-8000-000000000006', v_claim2, 'ride_reimbursement', v_ride_credit,      'completed', now() - interval '5 days'),
    ('dddddddd-0001-4000-8000-000000000007', v_claim2, 'driver_kickback',   v_driver_kickback,   'completed', now() - interval '5 days'),
    ('dddddddd-0001-4000-8000-000000000008', v_claim2, 'platform_fee',      v_platform_fee,      'completed', now() - interval '5 days'),
    -- Claim 3 transactions
    ('dddddddd-0001-4000-8000-000000000009', v_claim3, 'venue_charge',       v_ride_credit + v_driver_kickback + v_platform_fee, 'completed', now() - interval '4 days'),
    ('dddddddd-0001-4000-8000-000000000010', v_claim3, 'ride_reimbursement', v_ride_credit,      'completed', now() - interval '4 days'),
    ('dddddddd-0001-4000-8000-000000000011', v_claim3, 'driver_kickback',   v_driver_kickback,   'completed', now() - interval '4 days'),
    ('dddddddd-0001-4000-8000-000000000012', v_claim3, 'platform_fee',      v_platform_fee,      'completed', now() - interval '4 days'),
    -- Claim 4 transactions (no driver referral)
    ('dddddddd-0001-4000-8000-000000000013', v_claim4, 'venue_charge',       v_ride_credit + v_platform_fee, 'completed', now() - interval '3 days'),
    ('dddddddd-0001-4000-8000-000000000014', v_claim4, 'ride_reimbursement', v_ride_credit,      'completed', now() - interval '3 days'),
    ('dddddddd-0001-4000-8000-000000000015', v_claim4, 'platform_fee',      v_platform_fee,      'completed', now() - interval '3 days'),
    -- Claim 5 transactions
    ('dddddddd-0001-4000-8000-000000000016', v_claim5, 'venue_charge',       v_ride_credit + v_driver_kickback + v_platform_fee, 'completed', now() - interval '2 days'),
    ('dddddddd-0001-4000-8000-000000000017', v_claim5, 'ride_reimbursement', v_ride_credit,      'completed', now() - interval '2 days'),
    ('dddddddd-0001-4000-8000-000000000018', v_claim5, 'driver_kickback',   v_driver_kickback,   'completed', now() - interval '2 days'),
    ('dddddddd-0001-4000-8000-000000000019', v_claim5, 'platform_fee',      v_platform_fee,      'completed', now() - interval '2 days')
  ON CONFLICT (id) DO NOTHING;

  -- 5. Create referral records
  INSERT INTO referrals (id, driver_id, rider_user_id, referral_code_used, created_at) VALUES
    ('eeeeeeee-0001-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'FRANK123', now() - interval '7 days'),
    ('eeeeeeee-0001-4000-8000-000000000002', 'bbbbbbbb-0001-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000002', 'FRANK123', now() - interval '6 days'),
    ('eeeeeeee-0001-4000-8000-000000000003', 'bbbbbbbb-0001-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000003', 'GRACE456', now() - interval '5 days'),
    ('eeeeeeee-0001-4000-8000-000000000004', 'bbbbbbbb-0001-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000005', 'FRANK123', now() - interval '3 days')
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Seed data created successfully! You should now see data on your dashboard.';
END;
$$;
