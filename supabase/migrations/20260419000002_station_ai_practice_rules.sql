-- Praxis-spezifische KI-Regeln (Feedback an die KI)
CREATE TABLE IF NOT EXISTS station_ai_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  rule_text       TEXT NOT NULL,
  created_by      TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_station_ai_rules_practice
  ON station_ai_rules(practice_id, is_active);

ALTER TABLE station_ai_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY station_ai_rules_all ON station_ai_rules FOR ALL TO authenticated
  USING (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()))
  WITH CHECK (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()));
