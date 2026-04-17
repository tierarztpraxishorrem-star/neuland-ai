-- ============================================================
-- Phase 7: Reports & Stammdaten-Änderungsanträge
-- ============================================================

-- 1. Stammdaten-Änderungsanträge
CREATE TABLE IF NOT EXISTS employee_change_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  requested_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_name      TEXT NOT NULL,
  old_value       TEXT,
  new_value       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by     UUID REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_requests_practice
  ON employee_change_requests (practice_id, status);
CREATE INDEX IF NOT EXISTS idx_change_requests_employee
  ON employee_change_requests (employee_id);

ALTER TABLE employee_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS change_requests_select ON employee_change_requests;
CREATE POLICY change_requests_select
  ON employee_change_requests FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employee_change_requests.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS change_requests_insert ON employee_change_requests;
CREATE POLICY change_requests_insert
  ON employee_change_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

DROP POLICY IF EXISTS change_requests_update ON employee_change_requests;
CREATE POLICY change_requests_update
  ON employee_change_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employee_change_requests.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employee_change_requests.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- 2. Report-Hilfsfunktionen

-- Überstunden-Summary
CREATE OR REPLACE FUNCTION fn_overtime_summary(p_practice_id UUID, p_year INT, p_month INT DEFAULT NULL)
RETURNS TABLE (
  employee_id UUID,
  total_minutes BIGINT,
  approved_minutes BIGINT,
  pending_minutes BIGINT,
  used_time_off BIGINT,
  used_payout BIGINT,
  balance BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    oe.employee_id,
    SUM(oe.minutes)::BIGINT AS total_minutes,
    SUM(CASE WHEN oe.status = 'approved' THEN oe.minutes ELSE 0 END)::BIGINT AS approved_minutes,
    SUM(CASE WHEN oe.status = 'pending' THEN oe.minutes ELSE 0 END)::BIGINT AS pending_minutes,
    SUM(CASE WHEN oe.status = 'approved' AND oe.usage_type = 'time_off' THEN oe.minutes ELSE 0 END)::BIGINT AS used_time_off,
    SUM(CASE WHEN oe.status = 'approved' AND oe.usage_type = 'payout' THEN oe.minutes ELSE 0 END)::BIGINT AS used_payout,
    SUM(CASE WHEN oe.status = 'approved' AND oe.usage_type = 'open' THEN oe.minutes ELSE 0 END)::BIGINT AS balance
  FROM overtime_entries oe
  WHERE oe.practice_id = p_practice_id
    AND EXTRACT(YEAR FROM oe.date) = p_year
    AND (p_month IS NULL OR EXTRACT(MONTH FROM oe.date) = p_month)
  GROUP BY oe.employee_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Abwesenheits-Statistik
CREATE OR REPLACE FUNCTION fn_absence_statistics(p_practice_id UUID, p_year INT)
RETURNS TABLE (
  employee_id UUID,
  vacation_days BIGINT,
  sick_days BIGINT,
  school_days BIGINT,
  other_days BIGINT,
  total_days BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.employee_id,
    SUM(CASE WHEN a.type = 'vacation' AND a.status = 'approved' THEN (a.ends_on - a.starts_on + 1) ELSE 0 END)::BIGINT AS vacation_days,
    SUM(CASE WHEN a.type = 'sick' AND a.status != 'rejected' THEN (a.ends_on - a.starts_on + 1) ELSE 0 END)::BIGINT AS sick_days,
    SUM(CASE WHEN a.type = 'school' AND a.status != 'rejected' THEN (a.ends_on - a.starts_on + 1) ELSE 0 END)::BIGINT AS school_days,
    SUM(CASE WHEN a.type = 'other' AND a.status != 'rejected' THEN (a.ends_on - a.starts_on + 1) ELSE 0 END)::BIGINT AS other_days,
    SUM(CASE WHEN a.status != 'rejected' THEN (a.ends_on - a.starts_on + 1) ELSE 0 END)::BIGINT AS total_days
  FROM absences a
  WHERE a.practice_id = p_practice_id
    AND EXTRACT(YEAR FROM a.starts_on) = p_year
  GROUP BY a.employee_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
