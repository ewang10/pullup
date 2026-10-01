-- Access control: each role sees and changes only what it should.
--
-- Runs against a local database built from supabase/migrations
-- (`supabase test db`, in CI). Everything happens in one transaction that
-- is rolled back, so nothing persists.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT * FROM no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner, so RLS doesn't apply)
-- ---------------------------------------------------------------------------
INSERT INTO public.users (id, email, full_name, role) VALUES
  ('00000000-0000-4000-8000-000000000001', 'rider-a@test.local',  'Rider A',  'rider'),
  ('00000000-0000-4000-8000-000000000002', 'rider-b@test.local',  'Rider B',  'rider'),
  ('00000000-0000-4000-8000-000000000003', 'driver@test.local',   'Driver',   'driver'),
  ('00000000-0000-4000-8000-000000000004', 'venue-a@test.local',  'Venue A',  'venue_admin'),
  ('00000000-0000-4000-8000-000000000005', 'venue-b@test.local',  'Venue B',  'venue_admin'),
  ('00000000-0000-4000-8000-000000000006', 'support@test.local',  'Support',  'platform_support'),
  ('00000000-0000-4000-8000-000000000007', 'admin@test.local',    'Admin',    'platform_admin');

INSERT INTO public.driver_profiles (id, user_id, referral_code, verification_status, is_verified) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000003', 'TESTCODE', 'approved', true);

INSERT INTO public.venues (id, owner_user_id, name, category, address, city, state, stripe_customer_id, checkin_code) VALUES
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000004', 'Venue A', 'restaurant', '1 Main St', 'Austin', 'TX', 'cus_secret_a', 'AAAAAA'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000005', 'Venue B', 'bar',        '2 Main St', 'Austin', 'TX', 'cus_secret_b', 'BBBBBB');

INSERT INTO public.deals (id, venue_id, title, discount_type, discount_value, ride_credit_amount,
                          driver_kickback_amount, platform_fee_amount, daily_cap) VALUES
  ('00000000-0000-4000-8000-00000000de01', '00000000-0000-4000-8000-0000000000a1', 'Deal A', 'percentage', 10, 5, 2, 3, 10),
  ('00000000-0000-4000-8000-00000000de02', '00000000-0000-4000-8000-0000000000b1', 'Deal B', 'percentage', 10, 5, 2, 3, 10);

INSERT INTO public.deal_claims (id, deal_id, rider_user_id, status, expires_at) VALUES
  ('00000000-0000-4000-8000-0000000c1a01', '00000000-0000-4000-8000-00000000de01', '00000000-0000-4000-8000-000000000001', 'reserved', now() + interval '2 hours'),
  ('00000000-0000-4000-8000-0000000c1a02', '00000000-0000-4000-8000-00000000de02', '00000000-0000-4000-8000-000000000002', 'reserved', now() + interval '2 hours');

-- Act as a signed-in user (or anon when uid is NULL) for the following statements.
CREATE FUNCTION pg_temp.act_as(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF uid IS NULL THEN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    PERFORM set_config('role', 'anon', true);
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.act_as(uuid) TO anon, authenticated;

CREATE FUNCTION pg_temp.as_owner() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.as_owner() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sign-up can't create staff accounts
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'sneaky@test.local', '{"full_name":"Sneaky","role":"platform_admin"}', now(), now());
SELECT is((SELECT role::text FROM public.users WHERE id = '00000000-0000-4000-8000-0000000000f1'), 'rider',
          'sign-up asking for platform_admin becomes a rider');
SELECT is(public.safe_signup_role('platform_support')::text, 'rider', 'sign-up asking for platform_support becomes a rider');
SELECT is(public.safe_signup_role('driver')::text, 'driver', 'sign-up as a driver is allowed');

-- ---------------------------------------------------------------------------
-- Anonymous visitors
-- ---------------------------------------------------------------------------
SELECT pg_temp.act_as(NULL);
SELECT is((SELECT count(*)::int FROM public.users), 0, 'anon reads no users');
SELECT is((SELECT count(*)::int FROM public.deal_claims), 0, 'anon reads no claims');
SELECT is((SELECT count(*)::int FROM public.venues), 2, 'anon can list active venues');
SELECT throws_ok($$SELECT stripe_customer_id FROM public.venues$$, '42501', NULL, 'anon cannot read venue billing ids');
SELECT throws_ok($$SELECT checkin_code FROM public.venues$$, '42501', NULL, 'anon cannot read check-in codes');
SELECT throws_ok($$SELECT public.increment_driver_earnings('00000000-0000-4000-8000-0000000000d1', 100)$$,
                 '42501', NULL, 'anon cannot pay drivers');
SELECT throws_ok($$SELECT public.increment_rider_balance('00000000-0000-4000-8000-000000000001', 100)$$,
                 '42501', NULL, 'anon cannot credit riders');
SELECT pg_temp.as_owner();

-- ---------------------------------------------------------------------------
-- Riders
-- ---------------------------------------------------------------------------
SELECT pg_temp.act_as('00000000-0000-4000-8000-000000000001');
SELECT is((SELECT array_agg(id) FROM public.users), ARRAY['00000000-0000-4000-8000-000000000001'::uuid],
          'a rider reads only their own user row');
SELECT is((SELECT array_agg(id) FROM public.deal_claims), ARRAY['00000000-0000-4000-8000-0000000c1a01'::uuid],
          'a rider reads only their own claims');
SELECT throws_ok($$INSERT INTO public.deal_claims (deal_id, rider_user_id, expires_at)
                   VALUES ('00000000-0000-4000-8000-00000000de01', '00000000-0000-4000-8000-000000000001', now() + interval '1 hour')$$,
                 '42501', NULL, 'riders cannot create claims directly (only through claim-deal)');
SELECT throws_ok($$UPDATE public.deal_claims SET status = 'completed' WHERE id = '00000000-0000-4000-8000-0000000c1a01'$$,
                 'P0001', 'Riders cannot change claim status directly', 'riders cannot complete their own claim');
SELECT throws_ok($$UPDATE public.deal_claims SET referring_driver_id = '00000000-0000-4000-8000-0000000000d1'
                   WHERE id = '00000000-0000-4000-8000-0000000c1a01'$$,
                 'P0001', NULL, 'riders cannot attach a driver directly');
SELECT throws_ok($$UPDATE public.deal_claims SET ride_receipt_url = 'x' WHERE id = '00000000-0000-4000-8000-0000000c1a01'$$,
                 'P0001', 'Upload receipts after checking in at the venue', 'receipts only after check-in');
UPDATE public.deal_claims SET status = 'cancelled' WHERE id = '00000000-0000-4000-8000-0000000c1a02';
SELECT throws_ok($$UPDATE public.users SET role = 'platform_admin' WHERE id = '00000000-0000-4000-8000-000000000001'$$,
                 'P0001', NULL, 'riders cannot promote themselves');
SELECT throws_ok($$SELECT public.review_driver('00000000-0000-4000-8000-0000000000d1', 'suspend', 'x')$$,
                 'P0001', 'Access denied', 'riders cannot review drivers');
SELECT is((SELECT count(*)::int FROM public.driver_review_events), 0, 'riders cannot read the review log');
SELECT pg_temp.as_owner();
SELECT is((SELECT status::text FROM public.deal_claims WHERE id = '00000000-0000-4000-8000-0000000c1a02'), 'reserved',
          'a rider cannot change another rider''s claim');

-- ---------------------------------------------------------------------------
-- Venue owners
-- ---------------------------------------------------------------------------
SELECT pg_temp.act_as('00000000-0000-4000-8000-000000000004');
SELECT is((SELECT array_agg(id) FROM public.deal_claims), ARRAY['00000000-0000-4000-8000-0000000c1a01'::uuid],
          'a venue sees only claims on its own deals');
SELECT is((SELECT array_agg(venue_id) FROM public.get_my_venue_private()), ARRAY['00000000-0000-4000-8000-0000000000a1'::uuid],
          'get_my_venue_private returns only the caller''s venue');
SELECT is((SELECT checkin_code FROM public.get_my_venue_private()), 'AAAAAA', 'a venue can read its own check-in code');
SELECT throws_ok($$UPDATE public.venues SET stripe_customer_id = 'cus_mine' WHERE id = '00000000-0000-4000-8000-0000000000a1'$$,
                 'P0001', 'Billing fields are managed by PullUp', 'a venue cannot change its billing ids');
SELECT throws_ok($$UPDATE public.venues SET checkin_code = 'EASY11' WHERE id = '00000000-0000-4000-8000-0000000000a1'$$,
                 'P0001', NULL, 'a venue cannot pick its own check-in code');
UPDATE public.venues SET name = 'Hijacked' WHERE id = '00000000-0000-4000-8000-0000000000b1';
SELECT throws_ok($$INSERT INTO public.deals (venue_id, title, discount_type, discount_value, ride_credit_amount,
                   driver_kickback_amount, platform_fee_amount, daily_cap)
                   VALUES ('00000000-0000-4000-8000-0000000000b1', 'Not mine', 'percentage', 10, 5, 2, 3, 10)$$,
                 '42501', NULL, 'a venue cannot create deals for another venue');
SELECT throws_ok($$INSERT INTO public.deals (venue_id, title, discount_type, discount_value, ride_credit_amount,
                   driver_kickback_amount, platform_fee_amount, daily_cap)
                   VALUES ('00000000-0000-4000-8000-0000000000a1', 'No bank yet', 'percentage', 10, 5, 2, 3, 10)$$,
                 '42501', NULL, 'a venue without a linked bank cannot create deals');
SELECT is((SELECT count(*)::int FROM public.users WHERE role = 'rider'), 0, 'a venue cannot list riders');
SELECT pg_temp.as_owner();
SELECT is((SELECT name FROM public.venues WHERE id = '00000000-0000-4000-8000-0000000000b1'), 'Venue B',
          'a venue cannot edit another venue');

-- ---------------------------------------------------------------------------
-- Drivers
-- ---------------------------------------------------------------------------
SELECT pg_temp.act_as('00000000-0000-4000-8000-000000000003');
SELECT is((SELECT count(*)::int FROM public.deal_claims), 0, 'a driver cannot read riders'' claims');
SELECT throws_ok($$SELECT public.increment_driver_earnings('00000000-0000-4000-8000-0000000000d1', 100)$$,
                 '42501', NULL, 'a driver cannot pay themselves');
SELECT pg_temp.as_owner();

-- ---------------------------------------------------------------------------
-- Support staff: review drivers, but no admin-only powers
-- ---------------------------------------------------------------------------
SELECT pg_temp.act_as('00000000-0000-4000-8000-000000000006');
SELECT is((SELECT count(*)::int FROM public.users), 1, 'support cannot list all users (admin only)');
SELECT throws_ok($$SELECT public.review_driver('00000000-0000-4000-8000-0000000000d1', 'suspend', 'fraud')$$,
                 'P0001', 'Only admins can suspend an approved driver', 'support cannot suspend drivers');
UPDATE public.deal_claims SET status = 'completed' WHERE id = '00000000-0000-4000-8000-0000000c1a01';
SELECT pg_temp.as_owner();
SELECT is((SELECT status::text FROM public.deal_claims WHERE id = '00000000-0000-4000-8000-0000000c1a01'), 'reserved',
          'support cannot edit claims directly');

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------
SELECT pg_temp.act_as('00000000-0000-4000-8000-000000000007');
SELECT cmp_ok((SELECT count(*)::int FROM public.users), '>=', 7, 'admins can list users');
SELECT throws_ok($$SELECT public.review_driver('00000000-0000-4000-8000-0000000000d1', 'suspend', NULL)$$,
                 'P0001', 'A reason is required', 'suspending needs a reason');
SELECT lives_ok($$SELECT public.review_driver('00000000-0000-4000-8000-0000000000d1', 'suspend', 'Test', true)$$,
                'admins can suspend with a reason');
SELECT is((SELECT action FROM public.driver_review_events ORDER BY created_at DESC LIMIT 1), 'suspended',
          'the suspension is written to the review log');
SELECT throws_ok($$INSERT INTO public.driver_review_events (driver_profile_id, actor_name, actor_role, action)
                   VALUES ('00000000-0000-4000-8000-0000000000d1', 'Forged', 'platform_admin', 'approved')$$,
                 '42501', NULL, 'nobody can write the review log directly');
SELECT pg_temp.as_owner();
SELECT is((SELECT payouts_on_hold FROM public.driver_profiles WHERE id = '00000000-0000-4000-8000-0000000000d1'), true,
          'suspending with a payout hold sets the hold');

SELECT * FROM finish();
ROLLBACK;
