-- HR Lohnunterlagen: Admin lädt PDFs hoch, Mitarbeiter sehen nur eigene

CREATE TABLE IF NOT EXISTS payslips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id   UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  month         INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year          INT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  file_path     TEXT NOT NULL,
  file_size     INT,
  uploaded_by   UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id);
CREATE INDEX IF NOT EXISTS idx_payslips_practice_year ON payslips(practice_id, year DESC, month DESC);

ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;

-- Mitarbeiter sehen eigene, Admins alle der Praxis
DROP POLICY IF EXISTS payslips_select ON payslips;
CREATE POLICY payslips_select
  ON payslips FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = payslips.employee_id
        AND e.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = payslips.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- Nur Admins können hochladen
DROP POLICY IF EXISTS payslips_insert_admin ON payslips;
CREATE POLICY payslips_insert_admin
  ON payslips FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = payslips.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- Nur Admins können löschen
DROP POLICY IF EXISTS payslips_delete_admin ON payslips;
CREATE POLICY payslips_delete_admin
  ON payslips FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = payslips.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- Privater Storage-Bucket für Gehaltsabrechnungen
INSERT INTO storage.buckets (id, name, public)
VALUES ('payslips', 'payslips', false)
ON CONFLICT (id) DO NOTHING;
