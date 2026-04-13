-- Repair recursive RLS cycle between cases <-> case_access_grants.
-- Old setup referenced cases inside case_access_grants policies while
-- cases policies referenced case_access_grants, causing infinite recursion.

ALTER TABLE case_access_grants ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'case_access_grants'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON case_access_grants', pol.policyname);
  END LOOP;
END;
$$;

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
