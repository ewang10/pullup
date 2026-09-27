-- Create the 'receipts' storage bucket for ride receipt uploads.
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;
-- Allow authenticated users to upload receipts.
CREATE POLICY "Authenticated users can upload receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'receipts');
-- Allow authenticated users to read receipts.
CREATE POLICY "Authenticated users can read receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'receipts');
-- Allow users to update (upsert) their own receipts.
CREATE POLICY "Authenticated users can update receipts"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'receipts');
