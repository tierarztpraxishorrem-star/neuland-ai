-- Case visibility model: clinical cases are practice-wide, internal cases can be restricted.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS case_kind text,
  ADD COLUMN IF NOT EXISTS visibility_scope text;

ALTER TABLE cases
  ALTER COLUMN user_id SET DEFAULT auth.uid();

UPDATE cases
SET case_kind = CASE
  WHEN lower(coalesce(category, '')) = 'internal' THEN 'internal'
  ELSE 'clinical'
END
WHERE case_kind IS NULL;

UPDATE cases
SET visibility_scope = CASE
  WHEN case_kind = 'internal' THEN 'restricted'
  ELSE 'practice'
END
WHERE visibility_scope IS NULL;

ALTER TABLE cases
  ALTER COLUMN case_kind SET DEFAULT 'clinical';

ALTER TABLE cases
  ALTER COLUMN visibility_scope SET DEFAULT 'practice';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cases_case_kind_check'
      AND conrelid = 'cases'::regclass
  ) THEN
    ALTER TABLE cases
      ADD CONSTRAINT cases_case_kind_check CHECK (case_kind IN ('clinical', 'internal'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cases_visibility_scope_check'
      AND conrelid = 'cases'::regclass
  ) THEN
    ALTER TABLE cases
      ADD CONSTRAINT cases_visibility_scope_check CHECK (visibility_scope IN ('practice', 'restricted'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_cases_case_kind ON cases (case_kind);
CREATE INDEX IF NOT EXISTS idx_cases_visibility_scope ON cases (visibility_scope);

CREATE TABLE IF NOT EXISTS case_access_grants (
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  can_read boolean NOT NULL DEFAULT true,
  can_write boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_case_access_grants_user_id
  ON case_access_grants (user_id);

ALTER TABLE case_access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS case_access_grants_select_self_or_owner ON case_access_grants;
DROP POLICY IF EXISTS case_access_grants_manage_owner_or_creator ON case_access_grants;
DROP POLICY IF EXISTS case_access_grants_select_self_or_granter ON case_access_grants;
DROP POLICY IF EXISTS case_access_grants_insert_granter ON case_access_grants;
DROP POLICY IF EXISTS case_access_grants_update_granter ON case_access_grants;
DROP POLICY IF EXISTS case_access_grants_delete_granter ON case_access_grants;

CREATE POLICY case_access_grants_select_self_or_granter
  ON case_access_grants
  FOR SELECT
  TO authenticated
  USING (
    case_access_grants.user_id = auth.uid()
    OR case_access_grants.created_by = auth.uid()
  );

CREATE POLICY case_access_grants_insert_granter
  ON case_access_grants
  FOR INSERT
  TO authenticated
  WITH CHECK (case_access_grants.created_by = auth.uid());

CREATE POLICY case_access_grants_update_granter
  ON case_access_grants
  FOR UPDATE
  TO authenticated
  USING (case_access_grants.created_by = auth.uid())
  WITH CHECK (case_access_grants.created_by = auth.uid());

CREATE POLICY case_access_grants_delete_granter
  ON case_access_grants
  FOR DELETE
  TO authenticated
  USING (case_access_grants.created_by = auth.uid());

CREATE OR REPLACE FUNCTION enforce_case_visibility_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.case_kind IS NULL THEN
    NEW.case_kind := CASE
      WHEN lower(coalesce(NEW.category, '')) = 'internal' THEN 'internal'
      ELSE 'clinical'
    END;
  END IF;

  IF NEW.visibility_scope IS NULL THEN
    NEW.visibility_scope := CASE
      WHEN NEW.case_kind = 'internal' THEN 'restricted'
      ELSE 'practice'
    END;
  END IF;

  IF NEW.case_kind = 'clinical' THEN
    NEW.visibility_scope := 'practice';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_case_visibility_rules ON cases;
CREATE TRIGGER trg_enforce_case_visibility_rules
BEFORE INSERT OR UPDATE ON cases
FOR EACH ROW
EXECUTE FUNCTION enforce_case_visibility_rules();

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cases'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON cases', pol.policyname);
  END LOOP;
END;
$$;

CREATE POLICY cases_select_accessible
  ON cases
  FOR SELECT
  TO authenticated
  USING (
    cases.practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = cases.practice_id
        AND pm.user_id = auth.uid()
    )
    AND (
      cases.visibility_scope = 'practice'
      OR cases.user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM practice_memberships pm_owner
        WHERE pm_owner.practice_id = cases.practice_id
          AND pm_owner.user_id = auth.uid()
          AND pm_owner.role IN ('owner', 'admin')
      )
      OR EXISTS (
        SELECT 1
        FROM case_access_grants cag
        WHERE cag.case_id = cases.id
          AND cag.user_id = auth.uid()
          AND cag.can_read = true
      )
    )
  );

CREATE POLICY cases_insert_scoped
  ON cases
  FOR INSERT
  TO authenticated
  WITH CHECK (
    cases.practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = cases.practice_id
        AND pm.user_id = auth.uid()
    )
    AND (
      (coalesce(cases.case_kind, 'clinical') = 'clinical' AND coalesce(cases.visibility_scope, 'practice') = 'practice')
      OR (coalesce(cases.case_kind, 'clinical') = 'internal' AND coalesce(cases.visibility_scope, 'restricted') IN ('practice', 'restricted'))
    )
  );

CREATE POLICY cases_update_scoped
  ON cases
  FOR UPDATE
  TO authenticated
  USING (
    cases.practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = cases.practice_id
        AND pm.user_id = auth.uid()
    )
    AND (
      cases.visibility_scope = 'practice'
      OR cases.user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM practice_memberships pm_owner
        WHERE pm_owner.practice_id = cases.practice_id
          AND pm_owner.user_id = auth.uid()
          AND pm_owner.role IN ('owner', 'admin')
      )
      OR EXISTS (
        SELECT 1
        FROM case_access_grants cag
        WHERE cag.case_id = cases.id
          AND cag.user_id = auth.uid()
          AND cag.can_write = true
      )
    )
  )
  WITH CHECK (
    cases.practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = cases.practice_id
        AND pm.user_id = auth.uid()
    )
    AND (
      (coalesce(cases.case_kind, 'clinical') = 'clinical' AND coalesce(cases.visibility_scope, 'practice') = 'practice')
      OR (coalesce(cases.case_kind, 'clinical') = 'internal' AND coalesce(cases.visibility_scope, 'restricted') IN ('practice', 'restricted'))
    )
  );

CREATE POLICY cases_delete_owner_or_creator
  ON cases
  FOR DELETE
  TO authenticated
  USING (
    cases.practice_id IS NOT NULL
    AND (
      cases.user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM practice_memberships pm_owner
        WHERE pm_owner.practice_id = cases.practice_id
          AND pm_owner.user_id = auth.uid()
          AND pm_owner.role IN ('owner', 'admin')
      )
    )
  );
