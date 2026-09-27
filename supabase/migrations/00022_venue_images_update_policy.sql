-- Allow venue owners to overwrite their own hero image (required for upsert).
-- Without this, INSERT ... ON CONFLICT DO UPDATE fails when the file already exists.
CREATE POLICY "Venue owners can update their hero image"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'venue-images'
  AND EXISTS (
    SELECT 1 FROM public.venues
    WHERE id::text = split_part(name, '/', 1)
      AND owner_user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'venue-images'
  AND EXISTS (
    SELECT 1 FROM public.venues
    WHERE id::text = split_part(name, '/', 1)
      AND owner_user_id = auth.uid()
  )
);
