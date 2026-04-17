-- ============================================================
-- Phase 1: Arbeitszeitmodelle
-- ============================================================

-- 1. Arbeitszeitmodelle-Tabelle
CREATE TABLE IF NOT EXISTS work_time_models (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('vollzeit', 'teilzeit', 'minijob', 'azubi', 'schicht', 'custom')),
  weekly_hours    NUMERIC(5,2) NOT NULL,
  daily_hours_target NUMERIC(5,2),
  work_days       JSONB NOT NULL DEFAULT '[1,2,3,4,5]',  -- ISO weekdays: 1=Mo, 7=So
  break_rules     JSONB NOT NULL DEFAULT '[{"after_hours": 6, "break_minutes": 30}, {"after_hours": 9, "break_minutes": 45}]',
  night_shift     BOOLEAN NOT NULL DEFAULT false,
  weekend_work    BOOLEAN NOT NULL DEFAULT false,
  holiday_work    BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_time_models_practice
  ON work_time_models (practice_id, is_active);

ALTER TABLE work_time_models ENABLE ROW LEVEL SECURITY;

-- RLS: Praxis-Mitglieder lesen, Admins schreiben
DROP POLICY IF EXISTS work_time_models_select ON work_time_models;
CREATE POLICY work_time_models_select
  ON work_time_models FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = work_time_models.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS work_time_models_insert ON work_time_models;
CREATE POLICY work_time_models_insert
  ON work_time_models FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = work_time_models.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS work_time_models_update ON work_time_models;
CREATE POLICY work_time_models_update
  ON work_time_models FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = work_time_models.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = work_time_models.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS work_time_models_delete ON work_time_models;
CREATE POLICY work_time_models_delete
  ON work_time_models FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = work_time_models.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- 2. Zuordnung Mitarbeiter → Arbeitszeitmodell (historisiert)
CREATE TABLE IF NOT EXISTS employee_work_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_time_model_id UUID NOT NULL REFERENCES work_time_models(id) ON DELETE CASCADE,
  valid_from      DATE NOT NULL,
  valid_to        DATE,  -- NULL = aktuell gültig
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_work_valid_range CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_employee_work_assignments_employee
  ON employee_work_assignments (employee_id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_employee_work_assignments_current
  ON employee_work_assignments (employee_id)
  WHERE valid_to IS NULL;

ALTER TABLE employee_work_assignments ENABLE ROW LEVEL SECURITY;

-- RLS: Mitarbeiter sieht eigene, Admins sehen alle
DROP POLICY IF EXISTS employee_work_assignments_select ON employee_work_assignments;
CREATE POLICY employee_work_assignments_select
  ON employee_work_assignments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employee_work_assignments.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS employee_work_assignments_insert ON employee_work_assignments;
CREATE POLICY employee_work_assignments_insert
  ON employee_work_assignments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employee_work_assignments.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS employee_work_assignments_update ON employee_work_assignments;
CREATE POLICY employee_work_assignments_update
  ON employee_work_assignments FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employee_work_assignments.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employee_work_assignments.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS employee_work_assignments_delete ON employee_work_assignments;
CREATE POLICY employee_work_assignments_delete
  ON employee_work_assignments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employee_work_assignments.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- 3. Helper: Aktuelles Arbeitszeitmodell eines Mitarbeiters
CREATE OR REPLACE FUNCTION get_current_work_model(p_employee_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  model_id UUID,
  model_name TEXT,
  model_type TEXT,
  weekly_hours NUMERIC,
  daily_hours_target NUMERIC,
  work_days JSONB,
  break_rules JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    wtm.id,
    wtm.name,
    wtm.type,
    wtm.weekly_hours,
    wtm.daily_hours_target,
    wtm.work_days,
    wtm.break_rules
  FROM employee_work_assignments ewa
  JOIN work_time_models wtm ON wtm.id = ewa.work_time_model_id
  WHERE ewa.employee_id = p_employee_id
    AND ewa.valid_from <= p_date
    AND (ewa.valid_to IS NULL OR ewa.valid_to >= p_date)
    AND wtm.is_active = true
  ORDER BY ewa.valid_from DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 4. Standard-Modelle als Seed
-- (Diese werden beim ersten Zugriff über die API angelegt, nicht hier,
--  da practice_id benötigt wird)
