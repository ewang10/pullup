-- Add timestamp so admins can see newest uploads first
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS hero_image_updated_at timestamptz;
-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('venue-images', 'venue-images', true)
ON CONFLICT (id) DO NOTHING;
-- Venue owners can upload to their own folder ({venue_id}/...)
CREATE POLICY "Venue owners can upload hero image"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'venue-images'
  AND EXISTS (
    SELECT 1 FROM public.venues
    WHERE id::text = split_part(name, '/', 1)
      AND owner_user_id = auth.uid()
  )
);
-- Anyone can read (bucket is public but add policy for clarity)
CREATE POLICY "Public can read venue images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'venue-images');
-- Venue owners can delete their own files
CREATE POLICY "Venue owners can delete their hero image"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'venue-images'
  AND EXISTS (
    SELECT 1 FROM public.venues
    WHERE id::text = split_part(name, '/', 1)
      AND owner_user_id = auth.uid()
  )
);
-- Platform team can delete any venue image (moderation)
CREATE POLICY "Platform team can delete venue images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'venue-images'
  AND public.is_platform_admin()
);
