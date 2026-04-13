-- Multi-tenant foundation for practices/units/memberships and scoped data access.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS practice_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_units_unique_name
  ON practice_units (practice_id, lower(name));

CREATE TABLE IF NOT EXISTS practice_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES practice_units(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_memberships_role_check CHECK (role IN ('owner', 'admin', 'member')),
  CONSTRAINT practice_memberships_unique_user UNIQUE (practice_id, user_id)
);

CREATE TABLE IF NOT EXISTS practice_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES practice_units(id) ON DELETE SET NULL,
  invite_code text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'member',
  expires_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_invitations_role_check CHECK (role IN ('owner', 'admin', 'member'))
);

CREATE INDEX IF NOT EXISTS idx_practice_memberships_user_id ON practice_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_practice_memberships_practice_id ON practice_memberships (practice_id);
CREATE INDEX IF NOT EXISTS idx_practice_invitations_practice_id ON practice_invitations (practice_id);

ALTER TABLE practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practices_select_member ON practices;
CREATE POLICY practices_select_member
  ON practices
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practices.id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS practices_insert_creator ON practices;
CREATE POLICY practices_insert_creator
  ON practices
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS practices_manage_admin ON practices;
CREATE POLICY practices_manage_admin
  ON practices
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practices.id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practices.id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS practices_delete_owner ON practices;
CREATE POLICY practices_delete_owner
  ON practices
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practices.id
        AND pm.user_id = auth.uid()
        AND pm.role = 'owner'
    )
  );

DROP POLICY IF EXISTS practice_units_select_member ON practice_units;
CREATE POLICY practice_units_select_member
  ON practice_units
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_units.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS practice_units_manage_admin ON practice_units;
CREATE POLICY practice_units_manage_admin
  ON practice_units
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_units.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_units.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS practice_memberships_select_self_or_admin ON practice_memberships;
DROP POLICY IF EXISTS practice_memberships_select_self ON practice_memberships;
CREATE POLICY practice_memberships_select_self
  ON practice_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS practice_memberships_insert_owner_bootstrap ON practice_memberships;
DROP POLICY IF EXISTS practice_memberships_insert_self ON practice_memberships;
CREATE POLICY practice_memberships_insert_self
  ON practice_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS practice_memberships_update_admin ON practice_memberships;
DROP POLICY IF EXISTS practice_memberships_update_self ON practice_memberships;
CREATE POLICY practice_memberships_update_self
  ON practice_memberships
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS practice_memberships_delete_owner ON practice_memberships;
DROP POLICY IF EXISTS practice_memberships_delete_self ON practice_memberships;
CREATE POLICY practice_memberships_delete_self
  ON practice_memberships
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS practice_invitations_select_member ON practice_invitations;
CREATE POLICY practice_invitations_select_member
  ON practice_invitations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_invitations.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS practice_invitations_manage_admin ON practice_invitations;
CREATE POLICY practice_invitations_manage_admin
  ON practice_invitations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_invitations.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_invitations.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

CREATE OR REPLACE FUNCTION app_default_practice_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT pm.practice_id
  FROM practice_memberships pm
  WHERE pm.user_id = auth.uid()
  ORDER BY
    CASE pm.role
      WHEN 'owner' THEN 0
      WHEN 'admin' THEN 1
      ELSE 2
    END,
    pm.created_at ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION accept_practice_invitation(p_invite_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_row practice_invitations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
  INTO invite_row
  FROM practice_invitations
  WHERE invite_code = p_invite_code
    AND accepted_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found_or_expired';
  END IF;

  INSERT INTO practice_memberships (practice_id, user_id, unit_id, role)
  VALUES (invite_row.practice_id, auth.uid(), invite_row.unit_id, invite_row.role)
  ON CONFLICT (practice_id, user_id)
  DO UPDATE SET
    unit_id = EXCLUDED.unit_id,
    role = EXCLUDED.role;

  UPDATE practice_invitations
  SET accepted_by = auth.uid(),
      accepted_at = now()
  WHERE id = invite_row.id;

  RETURN invite_row.practice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_practice_invitation(text) TO authenticated;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES practices(id) ON DELETE CASCADE;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE patients
  ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE patients
  ALTER COLUMN practice_id SET DEFAULT app_default_practice_id();

CREATE INDEX IF NOT EXISTS idx_patients_practice_id ON patients (practice_id);

DROP POLICY IF EXISTS patients_select_authenticated ON patients;
DROP POLICY IF EXISTS patients_insert_authenticated ON patients;
DROP POLICY IF EXISTS patients_update_authenticated ON patients;
DROP POLICY IF EXISTS patients_delete_authenticated ON patients;

DROP POLICY IF EXISTS patients_select_practice_member ON patients;
CREATE POLICY patients_select_practice_member
  ON patients
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = patients.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS patients_insert_practice_member ON patients;
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

DROP POLICY IF EXISTS patients_update_practice_member ON patients;
CREATE POLICY patients_update_practice_member
  ON patients
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
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

DROP POLICY IF EXISTS patients_delete_practice_member ON patients;
CREATE POLICY patients_delete_practice_member
  ON patients
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = patients.practice_id
        AND pm.user_id = auth.uid()
    )
  );

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE templates
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS templates_select_own ON templates;
CREATE POLICY templates_select_own
  ON templates
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS templates_insert_own ON templates;
CREATE POLICY templates_insert_own
  ON templates
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS templates_update_own ON templates;
CREATE POLICY templates_update_own
  ON templates
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS templates_delete_own ON templates;
CREATE POLICY templates_delete_own
  ON templates
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
