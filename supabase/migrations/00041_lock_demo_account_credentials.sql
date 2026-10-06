-- The public demo accounts share a password shown on the site. Anyone signed
-- in to one could change its password or email (a fresh session needs no
-- re-authentication) and lock every other visitor out. Block credential
-- changes on those accounts at the database, so no client can get around it.
--
-- To change a demo password deliberately, an admin can run:
--   ALTER TABLE auth.users DISABLE TRIGGER trg_lock_demo_credentials;
--   ... update ...
--   ALTER TABLE auth.users ENABLE TRIGGER trg_lock_demo_credentials;

CREATE OR REPLACE FUNCTION public.lock_demo_credentials()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF lower(OLD.email) LIKE 'pullup.demo.app%@gmail.com'
     AND (NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password
          OR NEW.email IS DISTINCT FROM OLD.email) THEN
    RAISE EXCEPTION 'demo_account_locked: demo account passwords and emails can''t be changed';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_demo_credentials() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lock_demo_credentials ON auth.users;
CREATE TRIGGER trg_lock_demo_credentials
  BEFORE UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.lock_demo_credentials();
