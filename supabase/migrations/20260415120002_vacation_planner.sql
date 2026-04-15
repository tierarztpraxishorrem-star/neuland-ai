-- Urlaubsplaner: groups, entitlements, holidays, absences enhancements

-- ============================================================
-- Extend employees table
-- ============================================================

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- ============================================================
-- Employee Groups
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id  UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#6366f1',
  min_coverage INT NOT NULL DEFAULT 50,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_groups_practice_id ON employee_groups (practice_id);

ALTER TABLE employee_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_groups_select_practice_member ON employee_groups;
CREATE POLICY employee_groups_select_practice_member
  ON employee_groups FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employee_groups.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS employee_groups_insert_admin ON employee_groups;
CREATE POLICY employee_groups_insert_admin
  ON employee_groups FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employee_groups.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS employee_groups_update_admin ON employee_groups;
CREATE POLICY employee_groups_update_admin
  ON employee_groups FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employee_groups.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employee_groups.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS employee_groups_delete_admin ON employee_groups;
CREATE POLICY employee_groups_delete_admin
  ON employee_groups FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employee_groups.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- Employee Group Members (junction table)
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_group_members (
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  group_id    UUID NOT NULL REFERENCES employee_groups(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'group_admin')),
  PRIMARY KEY (employee_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_egm_group_id ON employee_group_members (group_id);
CREATE INDEX IF NOT EXISTS idx_egm_employee_id ON employee_group_members (employee_id);

ALTER TABLE employee_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS egm_select_practice_member ON employee_group_members;
CREATE POLICY egm_select_practice_member
  ON employee_group_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employee_groups eg
      JOIN practice_memberships pm ON pm.practice_id = eg.practice_id
      WHERE eg.id = employee_group_members.group_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS egm_insert_admin ON employee_group_members;
CREATE POLICY egm_insert_admin
  ON employee_group_members FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employee_groups eg
      JOIN practice_memberships pm ON pm.practice_id = eg.practice_id
      WHERE eg.id = employee_group_members.group_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS egm_update_admin ON employee_group_members;
CREATE POLICY egm_update_admin
  ON employee_group_members FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employee_groups eg
      JOIN practice_memberships pm ON pm.practice_id = eg.practice_id
      WHERE eg.id = employee_group_members.group_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employee_groups eg
      JOIN practice_memberships pm ON pm.practice_id = eg.practice_id
      WHERE eg.id = employee_group_members.group_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS egm_delete_admin ON employee_group_members;
CREATE POLICY egm_delete_admin
  ON employee_group_members FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employee_groups eg
      JOIN practice_memberships pm ON pm.practice_id = eg.practice_id
      WHERE eg.id = employee_group_members.group_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- Extend absences table (add reviewer tracking)
-- ============================================================

ALTER TABLE absences
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- ============================================================
-- Vacation Entitlements
-- ============================================================

CREATE TABLE IF NOT EXISTS vacation_entitlements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year        INT NOT NULL,
  days_total  INT NOT NULL DEFAULT 30,
  days_carry  INT NOT NULL DEFAULT 0,
  UNIQUE (employee_id, year)
);

CREATE INDEX IF NOT EXISTS idx_vacation_entitlements_employee_year
  ON vacation_entitlements (employee_id, year);

ALTER TABLE vacation_entitlements ENABLE ROW LEVEL SECURITY;

-- Employees can see their own, admins can see all in practice
DROP POLICY IF EXISTS ve_select ON vacation_entitlements;
CREATE POLICY ve_select
  ON vacation_entitlements FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = vacation_entitlements.employee_id
        AND e.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = vacation_entitlements.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS ve_insert_admin ON vacation_entitlements;
CREATE POLICY ve_insert_admin
  ON vacation_entitlements FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = vacation_entitlements.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS ve_update_admin ON vacation_entitlements;
CREATE POLICY ve_update_admin
  ON vacation_entitlements FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = vacation_entitlements.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = vacation_entitlements.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS ve_delete_admin ON vacation_entitlements;
CREATE POLICY ve_delete_admin
  ON vacation_entitlements FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = vacation_entitlements.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- Public Holidays
-- ============================================================

CREATE TABLE IF NOT EXISTS public_holidays (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  name        TEXT NOT NULL,
  UNIQUE (practice_id, date)
);

CREATE INDEX IF NOT EXISTS idx_public_holidays_practice_date
  ON public_holidays (practice_id, date);

ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ph_select_practice_member ON public_holidays;
CREATE POLICY ph_select_practice_member
  ON public_holidays FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = public_holidays.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ph_insert_admin ON public_holidays;
CREATE POLICY ph_insert_admin
  ON public_holidays FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = public_holidays.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS ph_update_admin ON public_holidays;
CREATE POLICY ph_update_admin
  ON public_holidays FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = public_holidays.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = public_holidays.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS ph_delete_admin ON public_holidays;
CREATE POLICY ph_delete_admin
  ON public_holidays FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = public_holidays.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- Seed NRW holidays 2026 (via function to handle per-practice)
-- This creates a helper function that admins can call per practice
-- ============================================================

CREATE OR REPLACE FUNCTION seed_nrw_holidays_2026(p_practice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public_holidays (practice_id, date, name) VALUES
    (p_practice_id, '2026-01-01', 'Neujahr'),
    (p_practice_id, '2026-04-03', 'Karfreitag'),
    (p_practice_id, '2026-04-06', 'Ostermontag'),
    (p_practice_id, '2026-05-01', 'Tag der Arbeit'),
    (p_practice_id, '2026-05-14', 'Christi Himmelfahrt'),
    (p_practice_id, '2026-05-25', 'Pfingstmontag'),
    (p_practice_id, '2026-06-04', 'Fronleichnam'),
    (p_practice_id, '2026-10-03', 'Tag der Deutschen Einheit'),
    (p_practice_id, '2026-11-01', 'Allerheiligen'),
    (p_practice_id, '2026-12-25', '1. Weihnachtstag'),
    (p_practice_id, '2026-12-26', '2. Weihnachtstag')
  ON CONFLICT (practice_id, date) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_nrw_holidays_2026(uuid) TO service_role;
