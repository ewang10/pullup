-- Server-side limits on uploads. Both buckets accepted any file type and size,
-- so a user could upload very large files or HTML/SVG (which can carry
-- scripts) to a public bucket.

-- Venue photos: public, owner-uploaded. Photos only, 5 MB.
UPDATE storage.buckets
SET file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'venue-images';

-- Receipts: private. Photos only, 10 MB. SVG stays allowed for the bucket so
-- the demo seed (service role) can store generated sample receipts, but the
-- rider upload policy below only accepts photo file extensions.
UPDATE storage.buckets
SET file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/svg+xml']
WHERE id = 'receipts';

DROP POLICY IF EXISTS "receipts_insert_own_claim" ON storage.objects;
CREATE POLICY "receipts_insert_own_claim"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp', 'heic')
  AND EXISTS (
    SELECT 1 FROM public.deal_claims dc
    WHERE dc.id::text = (storage.foldername(name))[2]
      AND dc.rider_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Venue owners can upload hero image" ON storage.objects;
CREATE POLICY "Venue owners can upload hero image"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'venue-images'
  AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
  AND public.is_venue_owner_by_storage_path(name)
);
