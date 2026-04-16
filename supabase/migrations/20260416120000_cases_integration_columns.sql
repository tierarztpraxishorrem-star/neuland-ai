-- Add missing integration columns to cases table
-- duration_seconds: recording length (was only in localStorage)
-- source: 'normal' or 'live' (track case origin)
-- completed_at: when user clicked save
-- geschlecht: patient sex (already in patients table, missing in cases)
-- analysis_json: full live-anamnesis analysis object (was lost in handoff)

ALTER TABLE cases ADD COLUMN IF NOT EXISTS duration_seconds integer;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'normal';
ALTER TABLE cases ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS geschlecht text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS analysis_json jsonb;

-- Constraint: source must be 'normal' or 'live'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_source_check'
  ) THEN
    ALTER TABLE cases ADD CONSTRAINT cases_source_check CHECK (source IN ('normal', 'live'));
  END IF;
END $$;
