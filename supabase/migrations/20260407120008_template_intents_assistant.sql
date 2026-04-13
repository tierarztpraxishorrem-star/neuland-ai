-- Structured intent layer for AI-assisted template authoring.

CREATE TABLE IF NOT EXISTS template_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL UNIQUE REFERENCES templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  scope text NOT NULL DEFAULT 'private',
  practice_id uuid REFERENCES practices(id) ON DELETE CASCADE,
  wizard_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  design_brief text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT template_intents_scope_check CHECK (scope IN ('private', 'practice'))
);

CREATE INDEX IF NOT EXISTS idx_template_intents_user_id ON template_intents (user_id);
CREATE INDEX IF NOT EXISTS idx_template_intents_practice_id ON template_intents (practice_id);

CREATE OR REPLACE FUNCTION set_template_intents_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_template_intents_updated_at ON template_intents;
CREATE TRIGGER trg_template_intents_updated_at
BEFORE UPDATE ON template_intents
FOR EACH ROW
EXECUTE FUNCTION set_template_intents_updated_at();

ALTER TABLE template_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS template_intents_select_owner ON template_intents;
CREATE POLICY template_intents_select_owner
  ON template_intents
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS template_intents_insert_owner ON template_intents;
CREATE POLICY template_intents_insert_owner
  ON template_intents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (scope = 'private' AND practice_id IS NULL)
      OR (
        scope = 'practice'
        AND practice_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM practice_memberships pm
          WHERE pm.practice_id = template_intents.practice_id
            AND pm.user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS template_intents_update_owner ON template_intents;
CREATE POLICY template_intents_update_owner
  ON template_intents
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (scope = 'private' AND practice_id IS NULL)
      OR (
        scope = 'practice'
        AND practice_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM practice_memberships pm
          WHERE pm.practice_id = template_intents.practice_id
            AND pm.user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS template_intents_delete_owner ON template_intents;
CREATE POLICY template_intents_delete_owner
  ON template_intents
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
