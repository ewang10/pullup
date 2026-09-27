-- ============================================================================
-- Fix infinite recursion in users RLS policy
-- ============================================================================
--
-- The users_select_platform_admin policy was querying the users table from
-- within its own RLS policy, causing infinite recursion. Fix: read the role
-- from auth.jwt() -> 'user_metadata' instead of querying the users table.
--
-- Depends on: 00008_receipt_review_and_rider_profiles.sql
-- ============================================================================

-- Drop the broken policy
DROP POLICY IF EXISTS "users_select_platform_admin" ON users;
-- Recreate using JWT metadata to avoid recursion
CREATE POLICY "users_select_platform_admin"
  ON users FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('platform_admin', 'platform_support')
  );
