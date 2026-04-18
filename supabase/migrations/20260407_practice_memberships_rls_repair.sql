-- Repair practice_memberships RLS to avoid recursive self-reference issues.

ALTER TABLE practice_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practice_memberships_select_self_or_admin ON practice_memberships;
DROP POLICY IF EXISTS practice_memberships_insert_owner_bootstrap ON practice_memberships;
DROP POLICY IF EXISTS practice_memberships_update_admin ON practice_memberships;
DROP POLICY IF EXISTS practice_memberships_delete_owner ON practice_memberships;

-- Minimal safe baseline: users can read/manage their own membership rows.
CREATE POLICY practice_memberships_select_self
  ON practice_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY practice_memberships_insert_self
  ON practice_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY practice_memberships_update_self
  ON practice_memberships
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY practice_memberships_delete_self
  ON practice_memberships
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
