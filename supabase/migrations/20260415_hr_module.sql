-- HR module foundation: employees, work sessions, audit log, feature flags

ALTER TABLE practices
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  employment_status text NOT NULL DEFAULT 'active',
  weekly_hours numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employees_employment_status_check CHECK (employment_status IN ('active', 'inactive', 'suspended')),
  CONSTRAINT employees_weekly_hours_check CHECK (weekly_hours IS NULL OR (weekly_hours >= 0 AND weekly_hours <= 168)),
  CONSTRAINT employees_unique_practice_user UNIQUE (practice_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_employees_practice_id ON employees (practice_id);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees (user_id);

CREATE TABLE IF NOT EXISTS work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  source text NOT NULL DEFAULT 'api',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_sessions_time_order_check CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_work_sessions_practice_id ON work_sessions (practice_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_employee_id ON work_sessions (employee_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_started_at ON work_sessions (started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_sessions_employee_open
  ON work_sessions (employee_id)
  WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_practice_id ON audit_log (practice_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_user_id ON audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employees_select_practice_member ON employees;
CREATE POLICY employees_select_practice_member
  ON employees
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = employees.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS employees_insert_admin ON employees;
CREATE POLICY employees_insert_admin
  ON employees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = employees.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS employees_update_admin ON employees;
CREATE POLICY employees_update_admin
  ON employees
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = employees.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = employees.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS employees_delete_owner ON employees;
CREATE POLICY employees_delete_owner
  ON employees
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = employees.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role = 'owner'
    )
  );

DROP POLICY IF EXISTS work_sessions_select_practice_member ON work_sessions;
CREATE POLICY work_sessions_select_practice_member
  ON work_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = work_sessions.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS work_sessions_insert_self_or_admin ON work_sessions;
CREATE POLICY work_sessions_insert_self_or_admin
  ON work_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = work_sessions.practice_id
        AND pm.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM employees e
      WHERE e.id = work_sessions.employee_id
        AND e.practice_id = work_sessions.practice_id
        AND (
          e.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM practice_memberships pm_admin
            WHERE pm_admin.practice_id = work_sessions.practice_id
              AND pm_admin.user_id = auth.uid()
              AND pm_admin.role IN ('owner', 'admin')
          )
        )
    )
  );

DROP POLICY IF EXISTS work_sessions_update_self_or_admin ON work_sessions;
CREATE POLICY work_sessions_update_self_or_admin
  ON work_sessions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = work_sessions.practice_id
        AND pm.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM employees e
      WHERE e.id = work_sessions.employee_id
        AND e.practice_id = work_sessions.practice_id
        AND (
          e.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM practice_memberships pm_admin
            WHERE pm_admin.practice_id = work_sessions.practice_id
              AND pm_admin.user_id = auth.uid()
              AND pm_admin.role IN ('owner', 'admin')
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = work_sessions.practice_id
        AND pm.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM employees e
      WHERE e.id = work_sessions.employee_id
        AND e.practice_id = work_sessions.practice_id
        AND (
          e.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM practice_memberships pm_admin
            WHERE pm_admin.practice_id = work_sessions.practice_id
              AND pm_admin.user_id = auth.uid()
              AND pm_admin.role IN ('owner', 'admin')
          )
        )
    )
  );

DROP POLICY IF EXISTS work_sessions_delete_admin ON work_sessions;
CREATE POLICY work_sessions_delete_admin
  ON work_sessions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = work_sessions.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS audit_log_select_practice_member ON audit_log;
CREATE POLICY audit_log_select_practice_member
  ON audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = audit_log.practice_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION hr_write_audit_log(
  p_practice_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO audit_log (
    practice_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    p_practice_id,
    p_actor_user_id,
    p_action,
    p_entity_type,
    p_entity_id,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION hr_write_audit_log(uuid, uuid, text, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_write_audit_log(uuid, uuid, text, text, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION hr_write_audit_log(uuid, uuid, text, text, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION hr_write_audit_log(uuid, uuid, text, text, uuid, jsonb) TO service_role;
