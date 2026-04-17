-- ============================================================
-- Phase 2: Zeiterfassungs-Korrekturen
-- ============================================================

CREATE TABLE IF NOT EXISTS work_session_corrections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id           UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  work_session_id       UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  employee_id           UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  original_started_at   TIMESTAMPTZ NOT NULL,
  original_ended_at     TIMESTAMPTZ,
  requested_started_at  TIMESTAMPTZ NOT NULL,
  requested_ended_at    TIMESTAMPTZ,
  reason                TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by           UUID REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_corrections_practice ON work_session_corrections (practice_id, status);
CREATE INDEX IF NOT EXISTS idx_corrections_employee ON work_session_corrections (employee_id);
CREATE INDEX IF NOT EXISTS idx_corrections_session ON work_session_corrections (work_session_id);

ALTER TABLE work_session_corrections ENABLE ROW LEVEL SECURITY;

-- Praxis-Mitglieder sehen alle Korrekturen
DROP POLICY IF EXISTS corrections_select ON work_session_corrections;
CREATE POLICY corrections_select
  ON work_session_corrections FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = work_session_corrections.practice_id
        AND pm.user_id = auth.uid()
    )
  );

-- Mitarbeiter erstellt eigene Korrekturanfrage
DROP POLICY IF EXISTS corrections_insert ON work_session_corrections;
CREATE POLICY corrections_insert
  ON work_session_corrections FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = work_session_corrections.employee_id
        AND e.practice_id = work_session_corrections.practice_id
        AND e.user_id = auth.uid()
    )
  );

-- Admin/Groupleader kann Korrekturen genehmigen/ablehnen
DROP POLICY IF EXISTS corrections_update ON work_session_corrections;
CREATE POLICY corrections_update
  ON work_session_corrections FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = work_session_corrections.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
    OR (
      EXISTS (
        SELECT 1 FROM practice_memberships pm
        WHERE pm.practice_id = work_session_corrections.practice_id
          AND pm.user_id = auth.uid()
          AND pm.role = 'groupleader'
      )
      AND is_groupleader_for_employee(auth.uid(), work_session_corrections.employee_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = work_session_corrections.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
    OR (
      EXISTS (
        SELECT 1 FROM practice_memberships pm
        WHERE pm.practice_id = work_session_corrections.practice_id
          AND pm.user_id = auth.uid()
          AND pm.role = 'groupleader'
      )
      AND is_groupleader_for_employee(auth.uid(), work_session_corrections.employee_id)
    )
  );
