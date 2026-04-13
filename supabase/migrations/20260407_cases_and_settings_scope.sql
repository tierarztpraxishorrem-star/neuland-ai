-- Scope cases and practice settings to memberships/practices.

CREATE TABLE IF NOT EXISTS practice_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  practice_name text,
  address text,
  phone text,
  email text,
  logo_data_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES practices(id) ON DELETE CASCADE;

ALTER TABLE cases
  ALTER COLUMN practice_id SET DEFAULT app_default_practice_id();

CREATE INDEX IF NOT EXISTS idx_cases_practice_id ON cases (practice_id);
CREATE INDEX IF NOT EXISTS idx_cases_user_id ON cases (user_id);

-- Backfill from linked patients when possible.
UPDATE cases c
SET practice_id = p.practice_id
FROM patients p
WHERE c.patient_id = p.id
  AND c.practice_id IS NULL
  AND p.practice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION set_case_practice_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.practice_id IS NULL AND NEW.patient_id IS NOT NULL THEN
    SELECT p.practice_id
    INTO NEW.practice_id
    FROM patients p
    WHERE p.id = NEW.patient_id;
  END IF;

  IF NEW.practice_id IS NULL THEN
    NEW.practice_id := app_default_practice_id();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_case_practice_id ON cases;
CREATE TRIGGER trg_set_case_practice_id
BEFORE INSERT OR UPDATE ON cases
FOR EACH ROW
EXECUTE FUNCTION set_case_practice_id();

ALTER TABLE cases ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY cases_select_practice_member
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
  );

CREATE POLICY cases_insert_practice_member
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
  );

CREATE POLICY cases_update_practice_member
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
  )
  WITH CHECK (
    cases.practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = cases.practice_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY cases_delete_practice_member
  ON cases
  FOR DELETE
  TO authenticated
  USING (
    cases.practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = cases.practice_id
        AND pm.user_id = auth.uid()
    )
  );

ALTER TABLE practice_settings DROP CONSTRAINT IF EXISTS practice_settings_pkey;
ALTER TABLE practice_settings DROP CONSTRAINT IF EXISTS practice_settings_id_check;

ALTER TABLE practice_settings
  ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES practices(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_settings_practice_id ON practice_settings (practice_id);

ALTER TABLE practice_settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'practice_settings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON practice_settings', pol.policyname);
  END LOOP;
END;
$$;

CREATE POLICY practice_settings_select_member
  ON practice_settings
  FOR SELECT
  TO authenticated
  USING (
    practice_settings.practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_settings.practice_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY practice_settings_insert_admin
  ON practice_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    practice_settings.practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_settings.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY practice_settings_update_admin
  ON practice_settings
  FOR UPDATE
  TO authenticated
  USING (
    practice_settings.practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_settings.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    practice_settings.practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_settings.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY practice_settings_delete_admin
  ON practice_settings
  FOR DELETE
  TO authenticated
  USING (
    practice_settings.practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_settings.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );
