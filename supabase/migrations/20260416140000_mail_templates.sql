-- Mail-Vorlagen: wiederverwendbare Betreff + Body für häufige Antworten.

CREATE TABLE IF NOT EXISTS mail_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id  UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  subject      TEXT,
  body         TEXT NOT NULL,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_templates_practice ON mail_templates (practice_id);

ALTER TABLE mail_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mail_templates_select ON mail_templates;
CREATE POLICY mail_templates_select
  ON mail_templates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = mail_templates.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS mail_templates_insert ON mail_templates;
CREATE POLICY mail_templates_insert
  ON mail_templates FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = mail_templates.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS mail_templates_update ON mail_templates;
CREATE POLICY mail_templates_update
  ON mail_templates FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = mail_templates.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS mail_templates_delete ON mail_templates;
CREATE POLICY mail_templates_delete
  ON mail_templates FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = mail_templates.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_mail_templates_updated_at ON mail_templates;
CREATE TRIGGER trg_mail_templates_updated_at
BEFORE UPDATE ON mail_templates
FOR EACH ROW
EXECUTE FUNCTION set_practice_settings_updated_at();

-- Signatur im bestehenden practice_settings (single-row Legacy-Tabelle).
ALTER TABLE practice_settings ADD COLUMN IF NOT EXISTS mail_signature TEXT;
