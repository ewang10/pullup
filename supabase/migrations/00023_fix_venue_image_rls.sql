-- Fix: inside the EXISTS (... FROM public.venues ...) subquery, the bare
-- column reference `name` was resolving to venues.name (the venue's display
-- name) rather than storage.objects.name (the file path) because PostgreSQL
-- resolves column names from the innermost scope first.  The EXISTS comparison
-- therefore became `id::text = split_part(venues.name, '/', 1)` which never
-- matched a UUID, so every upload was rejected.
--
-- Solution: wrap the ownership check in a SECURITY DEFINER function that
-- receives the storage path as an explicit parameter.  Calling the function
-- from the top-level policy expression (not from inside an EXISTS subquery
-- that has `venues` in scope) means `name` there unambiguously refers to
-- storage.objects.name.

CREATE OR REPLACE FUNCTION public.is_venue_owner_by_storage_path(storage_path text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM venues
    WHERE id::text = split_part(storage_path, '/', 1)
      AND owner_user_id = auth.uid()
  );
$$;
-- Drop the broken policies
DROP POLICY IF EXISTS "Venue owners can upload hero image"         ON storage.objects;
DROP POLICY IF EXISTS "Venue owners can update their hero image"   ON storage.objects;
DROP POLICY IF EXISTS "Venue owners can delete their hero image"   ON storage.objects;
-- Recreate using the unambiguous helper function
CREATE POLICY "Venue owners can upload hero image"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'venue-images'
  AND public.is_venue_owner_by_storage_path(name)
);
CREATE POLICY "Venue owners can update their hero image"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'venue-images'
  AND public.is_venue_owner_by_storage_path(name)
)
WITH CHECK (
  bucket_id = 'venue-images'
  AND public.is_venue_owner_by_storage_path(name)
);
CREATE POLICY "Venue owners can delete their hero image"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'venue-images'
  AND public.is_venue_owner_by_storage_path(name)
);
