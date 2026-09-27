-- ============================================================================
-- Fix RLS Security Gaps
-- ============================================================================
--
-- Discovered by automated tests. Four issues fixed:
--
-- 1. Riders could change their own role (users_update_own had no role guard)
-- 2. Riders could modify their own balance (rider_profiles_update_own too broad)
-- 3. Any authenticated user could insert venues (venues_insert_own missing role check)
-- ============================================================================


-- ============================================================================
-- 1. Prevent riders from escalating their own role
--    Use a trigger since PostgreSQL RLS WITH CHECK cannot reference OLD values.
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Role changes are not permitted via this operation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_escalation();
COMMENT ON FUNCTION prevent_role_escalation()
  IS 'Blocks any UPDATE that attempts to change the role column on users.';
-- ============================================================================
-- 2. Remove overly-broad rider_profiles update policy
--    Riders never need to update their own profile directly — all profile
--    mutations (Stripe onboarding, balance) go through service-role edge functions.
-- ============================================================================

DROP POLICY IF EXISTS "rider_profiles_update_own" ON rider_profiles;
-- ============================================================================
-- 3. Restrict venue inserts to users with venue_admin role
-- ============================================================================

DROP POLICY IF EXISTS "venues_insert_own" ON venues;
CREATE POLICY "venues_insert_own"
  ON venues FOR INSERT
  WITH CHECK (
    owner_user_id = auth.uid()
    AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) = 'venue_admin'
  );
