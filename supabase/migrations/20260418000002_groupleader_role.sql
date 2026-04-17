-- ============================================================
-- Phase 0: Groupleader-Rolle & erweiterte RLS-Policies
-- ============================================================

-- 1. practice_memberships.role erweitern um 'groupleader'
-- Bestehenden CHECK-Constraint droppen und neu setzen
DO $$
DECLARE
  constraint_name_val TEXT;
BEGIN
  SELECT con.conname INTO constraint_name_val
  FROM pg_constraint con
  JOIN pg_attribute att ON att.attrelid = con.conrelid
    AND att.attnum = ANY(con.conkey)
  WHERE con.conrelid = 'practice_memberships'::regclass
    AND att.attname = 'role'
    AND con.contype = 'c'
  LIMIT 1;

  IF constraint_name_val IS NOT NULL THEN
    EXECUTE format('ALTER TABLE practice_memberships DROP CONSTRAINT %I', constraint_name_val);
  END IF;
END $$;

ALTER TABLE practice_memberships
  ADD CONSTRAINT practice_memberships_role_check
  CHECK (role IN ('owner', 'admin', 'groupleader', 'member'));

-- 2. employees.role erweitern
DO $$
DECLARE
  constraint_name_val TEXT;
BEGIN
  SELECT con.conname INTO constraint_name_val
  FROM pg_constraint con
  JOIN pg_attribute att ON att.attrelid = con.conrelid
    AND att.attnum = ANY(con.conkey)
  WHERE con.conrelid = 'employees'::regclass
    AND att.attname = 'role'
    AND con.contype = 'c'
  LIMIT 1;

  IF constraint_name_val IS NOT NULL THEN
    EXECUTE format('ALTER TABLE employees DROP CONSTRAINT %I', constraint_name_val);
  END IF;
END $$;

ALTER TABLE employees
  ADD CONSTRAINT employees_role_check
  CHECK (role IN ('admin', 'groupleader', 'member'));

-- 3. Helper-Funktion: Ist User ein Groupleader für einen bestimmten Mitarbeiter?
CREATE OR REPLACE FUNCTION is_groupleader_for_employee(
  p_user_id UUID,
  p_employee_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    -- Der Viewer ist group_admin in einer Gruppe, in der der Ziel-Mitarbeiter Mitglied ist
    SELECT 1
    FROM employee_group_members gm_viewer
    JOIN employee_group_members gm_target
      ON gm_viewer.group_id = gm_target.group_id
    JOIN employees e_viewer
      ON e_viewer.id = gm_viewer.employee_id
      AND e_viewer.user_id = p_user_id
    WHERE gm_viewer.role = 'group_admin'
      AND gm_target.employee_id = p_employee_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 4. Helper-Funktion: Ist User Admin oder Groupleader in der Praxis?
CREATE OR REPLACE FUNCTION is_hr_manager(
  p_user_id UUID,
  p_practice_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM practice_memberships pm
    WHERE pm.user_id = p_user_id
      AND pm.practice_id = p_practice_id
      AND pm.role IN ('owner', 'admin', 'groupleader')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 5. RLS-Policies für absences: Groupleader darf Absences seiner Gruppen-MA sehen und genehmigen
DROP POLICY IF EXISTS absences_update_admin_or_self ON absences;
CREATE POLICY absences_update_admin_or_self
  ON absences FOR UPDATE TO authenticated
  USING (
    -- Admin/Owner darf alles
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = absences.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
    -- Groupleader darf Absences seiner Gruppen-MA bearbeiten
    OR (
      EXISTS (
        SELECT 1 FROM practice_memberships pm
        WHERE pm.practice_id = absences.practice_id
          AND pm.user_id = auth.uid()
          AND pm.role = 'groupleader'
      )
      AND is_groupleader_for_employee(auth.uid(), absences.employee_id)
    )
    -- Mitarbeiter darf eigene pending Absences bearbeiten
    OR (
      absences.status = 'pending'
      AND EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = absences.employee_id
          AND e.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = absences.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
    OR (
      EXISTS (
        SELECT 1 FROM practice_memberships pm
        WHERE pm.practice_id = absences.practice_id
          AND pm.user_id = auth.uid()
          AND pm.role = 'groupleader'
      )
      AND is_groupleader_for_employee(auth.uid(), absences.employee_id)
    )
    OR (
      absences.status = 'pending'
      AND EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = absences.employee_id
          AND e.user_id = auth.uid()
      )
    )
  );

-- 6. RLS für shifts: Groupleader darf Schichten seiner Gruppen-MA erstellen/bearbeiten
DROP POLICY IF EXISTS shifts_insert_admin ON shifts;
CREATE POLICY shifts_insert_admin
  ON shifts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = shifts.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
    OR (
      EXISTS (
        SELECT 1 FROM practice_memberships pm
        WHERE pm.practice_id = shifts.practice_id
          AND pm.user_id = auth.uid()
          AND pm.role = 'groupleader'
      )
      AND is_groupleader_for_employee(auth.uid(), shifts.employee_id)
    )
  );

DROP POLICY IF EXISTS shifts_update_admin ON shifts;
CREATE POLICY shifts_update_admin
  ON shifts FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = shifts.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
    OR (
      EXISTS (
        SELECT 1 FROM practice_memberships pm
        WHERE pm.practice_id = shifts.practice_id
          AND pm.user_id = auth.uid()
          AND pm.role = 'groupleader'
      )
      AND is_groupleader_for_employee(auth.uid(), shifts.employee_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = shifts.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
    OR (
      EXISTS (
        SELECT 1 FROM practice_memberships pm
        WHERE pm.practice_id = shifts.practice_id
          AND pm.user_id = auth.uid()
          AND pm.role = 'groupleader'
      )
      AND is_groupleader_for_employee(auth.uid(), shifts.employee_id)
    )
  );

DROP POLICY IF EXISTS shifts_delete_admin ON shifts;
CREATE POLICY shifts_delete_admin
  ON shifts FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = shifts.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
    OR (
      EXISTS (
        SELECT 1 FROM practice_memberships pm
        WHERE pm.practice_id = shifts.practice_id
          AND pm.user_id = auth.uid()
          AND pm.role = 'groupleader'
      )
      AND is_groupleader_for_employee(auth.uid(), shifts.employee_id)
    )
  );

-- 7. Employees-Tabelle: Groupleader sieht nur MA seiner Gruppen (neue Select-Policy)
-- Bestehende Select-Policy beibehalten (alle Practice-Mitglieder sehen alle Employees)
-- Das ist gewollt: Groupleader sehen ALLE MA in der Liste, aber sensible Felder werden
-- in der API gefiltert (nicht in RLS, da Supabase keine Spalten-RLS unterstützt)

-- 8. employees Tabelle: Groupleader darf Nicht-sensible Felder seiner MA aktualisieren
DROP POLICY IF EXISTS employees_update_self_or_admin ON employees;
CREATE POLICY employees_update_self_or_admin
  ON employees FOR UPDATE TO authenticated
  USING (
    -- Admins dürfen alle aktualisieren
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employees.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
    -- Groupleader darf seine Gruppen-MA aktualisieren
    OR (
      EXISTS (
        SELECT 1 FROM practice_memberships pm
        WHERE pm.practice_id = employees.practice_id
          AND pm.user_id = auth.uid()
          AND pm.role = 'groupleader'
      )
      AND is_groupleader_for_employee(auth.uid(), employees.id)
    )
    -- MA darf sich selbst aktualisieren (eingeschränkte Felder via API)
    OR employees.user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employees.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
    OR (
      EXISTS (
        SELECT 1 FROM practice_memberships pm
        WHERE pm.practice_id = employees.practice_id
          AND pm.user_id = auth.uid()
          AND pm.role = 'groupleader'
      )
      AND is_groupleader_for_employee(auth.uid(), employees.id)
    )
    OR employees.user_id = auth.uid()
  );
