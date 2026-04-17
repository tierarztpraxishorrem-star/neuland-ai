-- Storage bucket for audio recordings (konsultation, transcription uploads)
-- Bucket is PRIVATE – access via signed URLs only (createSignedUrl with TTL)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recordings',
  'recordings',
  false,
  157286400, -- 150 MB max (long recordings can be large)
  ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/mp3', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Authenticated users can upload recordings
DROP POLICY IF EXISTS "recordings_insert" ON storage.objects;
CREATE POLICY "recordings_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recordings');

-- Users can read their own uploads (needed for signed URL generation)
DROP POLICY IF EXISTS "recordings_select" ON storage.objects;
CREATE POLICY "recordings_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'recordings');

-- Users can update/overwrite their uploads (upsert)
DROP POLICY IF EXISTS "recordings_update" ON storage.objects;
CREATE POLICY "recordings_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'recordings');
