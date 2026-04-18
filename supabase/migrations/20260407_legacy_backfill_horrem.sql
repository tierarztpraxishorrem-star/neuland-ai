-- Backfill legacy data to a canonical practice for existing owner account.
-- This keeps historical data visible for info@tierarztpraxis-horrem.de after multi-tenant rollout.

DO $$
DECLARE
  owner_user_id uuid;
  horrem_practice_id uuid;
  has_practice_settings boolean;
BEGIN
  SELECT id
  INTO owner_user_id
  FROM auth.users
  WHERE lower(email) = 'info@tierarztpraxis-horrem.de'
  LIMIT 1;

  IF owner_user_id IS NULL THEN
    RAISE NOTICE 'Owner user info@tierarztpraxis-horrem.de not found. Skipping legacy backfill.';
    RETURN;
  END IF;

  INSERT INTO practices (name, slug, created_by)
  VALUES ('Tierarztpraxis Horrem', 'tierarztpraxis-horrem', owner_user_id)
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        created_by = owner_user_id
  RETURNING id INTO horrem_practice_id;

  IF horrem_practice_id IS NULL THEN
    SELECT id
    INTO horrem_practice_id
    FROM practices
    WHERE slug = 'tierarztpraxis-horrem'
    LIMIT 1;
  END IF;

  INSERT INTO practice_memberships (practice_id, user_id, role)
  VALUES (horrem_practice_id, owner_user_id, 'owner')
  ON CONFLICT (practice_id, user_id) DO UPDATE
    SET role = 'owner';

  -- Map patients linked to owner's cases into owner practice.
  UPDATE patients p
  SET practice_id = horrem_practice_id
  WHERE p.practice_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM cases c
      WHERE c.patient_id = p.id
        AND c.user_id = owner_user_id
    );

  -- If there are still orphan patients, assign to owner practice to preserve visibility.
  UPDATE patients
  SET practice_id = horrem_practice_id
  WHERE practice_id IS NULL;

  -- Scope owner cases to owner practice.
  UPDATE cases
  SET practice_id = horrem_practice_id
  WHERE practice_id IS NULL
    AND user_id = owner_user_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'practice_settings'
  )
  INTO has_practice_settings;

  IF has_practice_settings THEN
    UPDATE practice_settings
    SET practice_id = horrem_practice_id
    WHERE practice_id IS NULL;
  END IF;
END;
$$;

-- Safety: enforce strict patient policies even if prior migration execution was partial.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'patients'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON patients', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY patients_select_practice_member
  ON patients
  FOR SELECT
  TO authenticated
  USING (
    patients.practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = patients.practice_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY patients_insert_practice_member
  ON patients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    patients.practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = patients.practice_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY patients_update_practice_member
  ON patients
  FOR UPDATE
  TO authenticated
  USING (
    patients.practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = patients.practice_id
        AND pm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    patients.practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = patients.practice_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY patients_delete_practice_member
  ON patients
  FOR DELETE
  TO authenticated
  USING (
    patients.practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = patients.practice_id
        AND pm.user_id = auth.uid()
    )
  );
