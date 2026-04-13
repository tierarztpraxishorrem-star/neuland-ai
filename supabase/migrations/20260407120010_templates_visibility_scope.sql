-- Templates visibility model:
-- - global: visible to all authenticated users (legacy templates)
-- - private: visible only to creator (default for new templates)
-- - practice: visible to members of selected practice

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS scope text;

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES practices(id) ON DELETE CASCADE;

UPDATE templates
SET scope = 'global',
    practice_id = NULL
WHERE scope IS NULL;

ALTER TABLE templates
  ALTER COLUMN scope SET DEFAULT 'private';

UPDATE templates
SET scope = 'private'
WHERE scope NOT IN ('global', 'private', 'practice');

ALTER TABLE templates
  ALTER COLUMN scope SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'templates_scope_check'
      AND conrelid = 'templates'::regclass
  ) THEN
    ALTER TABLE templates
      ADD CONSTRAINT templates_scope_check CHECK (scope IN ('global', 'private', 'practice'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_templates_scope ON templates (scope);
CREATE INDEX IF NOT EXISTS idx_templates_practice_id ON templates (practice_id);

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'templates'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON templates', pol.policyname);
  END LOOP;
END;
$$;

CREATE POLICY templates_select_scoped
  ON templates
  FOR SELECT
  TO authenticated
  USING (
    scope = 'global'
    OR user_id = auth.uid()
    OR (
      scope = 'practice'
      AND practice_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM practice_memberships pm
        WHERE pm.practice_id = templates.practice_id
          AND pm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY templates_insert_scoped
  ON templates
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
          WHERE pm.practice_id = templates.practice_id
            AND pm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY templates_update_owner_scoped
  ON templates
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
          WHERE pm.practice_id = templates.practice_id
            AND pm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY templates_delete_owner
  ON templates
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
