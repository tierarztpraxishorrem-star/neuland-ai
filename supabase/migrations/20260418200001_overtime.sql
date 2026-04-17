-- ============================================================
-- Phase 2: Überstunden-Modul
-- ============================================================

CREATE TABLE IF NOT EXISTS overtime_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  minutes         INTEGER NOT NULL CHECK (minutes > 0),
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  usage_type      TEXT NOT NULL DEFAULT 'open' CHECK (usage_type IN ('open', 'time_off', 'payout')),
  approved_by     UUID REFERENCES employees(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  payout_note     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_overtime_practice ON overtime_entries (practice_id, status);
CREATE INDEX IF NOT EXISTS idx_overtime_employee ON overtime_entries (employee_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_overtime_date ON overtime_entries (date);

ALTER TABLE overtime_entries ENABLE ROW LEVEL SECURITY;

-- Mitarbeiter sieht eigene, Manager sehen Praxis
DROP POLICY IF EXISTS overtime_select ON overtime_entries;
CREATE POLICY overtime_select
  ON overtime_entries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = overtime_entries.practice_id
        AND pm.user_id = auth.uid()
    )
  );

-- Mitarbeiter kann eigene Einträge erstellen
DROP POLICY IF EXISTS overtime_insert ON overtime_entries;
CREATE POLICY overtime_insert
  ON overtime_entries FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = overtime_entries.employee_id
        AND e.practice_id = overtime_entries.practice_id
        AND e.user_id = auth.uid()
    )
  );

-- Admin/Groupleader kann Einträge aktualisieren (approve/reject)
DROP POLICY IF EXISTS overtime_update ON overtime_entries;
CREATE POLICY overtime_update
  ON overtime_entries FOR UPDATE TO authenticated
  USING (
    -- Admin/Owner
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = overtime_entries.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
    -- Groupleader für seine MA
    OR (
      EXISTS (
        SELECT 1 FROM practice_memberships pm
        WHERE pm.practice_id = overtime_entries.practice_id
          AND pm.user_id = auth.uid()
          AND pm.role = 'groupleader'
      )
      AND is_groupleader_for_employee(auth.uid(), overtime_entries.employee_id)
    )
    -- Mitarbeiter kann eigene pending stornieren
    OR (
      overtime_entries.status = 'pending'
      AND EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = overtime_entries.employee_id
          AND e.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = overtime_entries.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
    OR (
      EXISTS (
        SELECT 1 FROM practice_memberships pm
        WHERE pm.practice_id = overtime_entries.practice_id
          AND pm.user_id = auth.uid()
          AND pm.role = 'groupleader'
      )
      AND is_groupleader_for_employee(auth.uid(), overtime_entries.employee_id)
    )
    OR (
      overtime_entries.status IN ('pending', 'cancelled')
      AND EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = overtime_entries.employee_id
          AND e.user_id = auth.uid()
      )
    )
  );

-- Helper: Überstunden-Saldo eines Mitarbeiters
CREATE OR REPLACE FUNCTION get_overtime_balance(p_employee_id UUID)
RETURNS TABLE (
  total_approved_minutes INTEGER,
  used_time_off_minutes INTEGER,
  used_payout_minutes INTEGER,
  balance_minutes INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN oe.status = 'approved' THEN oe.minutes ELSE 0 END), 0)::INTEGER AS total_approved_minutes,
    COALESCE(SUM(CASE WHEN oe.status = 'approved' AND oe.usage_type = 'time_off' THEN oe.minutes ELSE 0 END), 0)::INTEGER AS used_time_off_minutes,
    COALESCE(SUM(CASE WHEN oe.status = 'approved' AND oe.usage_type = 'payout' THEN oe.minutes ELSE 0 END), 0)::INTEGER AS used_payout_minutes,
    (COALESCE(SUM(CASE WHEN oe.status = 'approved' AND oe.usage_type = 'open' THEN oe.minutes ELSE 0 END), 0))::INTEGER AS balance_minutes
  FROM overtime_entries oe
  WHERE oe.employee_id = p_employee_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
