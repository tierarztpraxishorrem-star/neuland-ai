CREATE TABLE IF NOT EXISTS case_drafts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  draft_data    JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE case_drafts ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS idx_case_drafts_case ON case_drafts(case_id);

-- RLS: user can only access drafts for cases they are a member of
CREATE POLICY "case_drafts_select" ON case_drafts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM case_members WHERE case_members.case_id = case_drafts.case_id AND case_members.user_id = auth.uid()
    )
  );

CREATE POLICY "case_drafts_upsert" ON case_drafts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM case_members WHERE case_members.case_id = case_drafts.case_id AND case_members.user_id = auth.uid()
    )
  );
