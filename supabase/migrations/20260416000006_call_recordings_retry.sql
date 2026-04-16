ALTER TABLE call_recordings
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_call_recordings_status_retry
  ON call_recordings(status, retry_count)
  WHERE status IN ('pending', 'failed');
