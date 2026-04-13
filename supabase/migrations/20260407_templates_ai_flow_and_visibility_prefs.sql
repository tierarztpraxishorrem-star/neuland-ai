-- Template UX/permission refinements:
-- 1) hide templates per user
-- 2) owner override for template maintenance (info@tierarztpraxis-horrem.de)

CREATE TABLE IF NOT EXISTS template_visibility_prefs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, template_id)
);

ALTER TABLE template_visibility_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS template_visibility_prefs_select_self ON template_visibility_prefs;
CREATE POLICY template_visibility_prefs_select_self
  ON template_visibility_prefs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS template_visibility_prefs_insert_self ON template_visibility_prefs;
CREATE POLICY template_visibility_prefs_insert_self
  ON template_visibility_prefs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS template_visibility_prefs_delete_self ON template_visibility_prefs;
CREATE POLICY template_visibility_prefs_delete_self
  ON template_visibility_prefs
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Recreate template policies with owner override.
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
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@tierarztpraxis-horrem.de'
    OR scope = 'global'
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
    (user_id = auth.uid() OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@tierarztpraxis-horrem.de')
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
      OR scope = 'global'
    )
  );

CREATE POLICY templates_update_owner_scoped
  ON templates
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@tierarztpraxis-horrem.de'
  )
  WITH CHECK (
    (user_id = auth.uid() OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@tierarztpraxis-horrem.de')
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
      OR scope = 'global'
    )
  );

CREATE POLICY templates_delete_owner
  ON templates
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@tierarztpraxis-horrem.de'
  );
