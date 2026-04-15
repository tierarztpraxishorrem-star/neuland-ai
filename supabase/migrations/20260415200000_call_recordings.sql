-- Call recordings: Yeastar integration for phone call transcription + AI summaries
CREATE TABLE IF NOT EXISTS call_recordings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  yeastar_call_id text,
  yeastar_recording_id text,
  caller text NOT NULL DEFAULT 'Unbekannt',
  callee text NOT NULL DEFAULT 'Unbekannt',
  direction text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound', 'internal')),
  duration_seconds integer DEFAULT 0,
  started_at timestamptz,
  ended_at timestamptz,
  recording_url text,
  transcript text,
  summary text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'downloading', 'transcribing', 'summarizing', 'done', 'failed')),
  error_message text,
  raw_event jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_recordings_practice ON call_recordings(practice_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_status ON call_recordings(status);
CREATE INDEX IF NOT EXISTS idx_call_recordings_started ON call_recordings(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_recordings_yeastar_call ON call_recordings(yeastar_call_id);

-- RLS
ALTER TABLE call_recordings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "call_recordings_select" ON call_recordings;
CREATE POLICY "call_recordings_select" ON call_recordings
  FOR SELECT USING (
    practice_id IN (
      SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "call_recordings_insert" ON call_recordings;
CREATE POLICY "call_recordings_insert" ON call_recordings
  FOR INSERT WITH CHECK (
    practice_id IN (
      SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "call_recordings_update" ON call_recordings;
CREATE POLICY "call_recordings_update" ON call_recordings
  FOR UPDATE USING (
    practice_id IN (
      SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()
    )
  );

-- Service role bypass for webhook background processing
DROP POLICY IF EXISTS "call_recordings_service" ON call_recordings;
CREATE POLICY "call_recordings_service" ON call_recordings
  FOR ALL USING (auth.role() = 'service_role');
