-- HR module extensions: absences, shifts, hr_documents, onboarding_tasks

-- ============================================================
-- Phase 1: Absences
-- ============================================================

CREATE TABLE IF NOT EXISTS absences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('vacation', 'sick', 'school', 'other')),
  starts_on   DATE NOT NULL,
  ends_on     DATE NOT NULL,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT absences_date_order CHECK (ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS idx_absences_practice_id ON absences (practice_id);
CREATE INDEX IF NOT EXISTS idx_absences_employee_id ON absences (employee_id);
CREATE INDEX IF NOT EXISTS idx_absences_starts_on ON absences (starts_on);
CREATE INDEX IF NOT EXISTS idx_absences_status ON absences (status);

ALTER TABLE absences ENABLE ROW LEVEL SECURITY;

-- Members can see absences within their practice
DROP POLICY IF EXISTS absences_select_practice_member ON absences;
CREATE POLICY absences_select_practice_member
  ON absences FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = absences.practice_id
        AND pm.user_id = auth.uid()
    )
  );

-- Members can insert their own absences
DROP POLICY IF EXISTS absences_insert_self ON absences;
CREATE POLICY absences_insert_self
  ON absences FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = absences.employee_id
        AND e.practice_id = absences.practice_id
        AND e.user_id = auth.uid()
    )
  );

-- Admins can update any absence (approve/reject), members can update own pending
DROP POLICY IF EXISTS absences_update_admin_or_self ON absences;
CREATE POLICY absences_update_admin_or_self
  ON absences FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = absences.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
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
      absences.status = 'pending'
      AND EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = absences.employee_id
          AND e.user_id = auth.uid()
      )
    )
  );

-- Admins can delete absences
DROP POLICY IF EXISTS absences_delete_admin ON absences;
CREATE POLICY absences_delete_admin
  ON absences FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = absences.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- Phase 2: Shifts
-- ============================================================

CREATE TABLE IF NOT EXISTS shifts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  starts_at   TIME NOT NULL,
  ends_at     TIME NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shifts_practice_id ON shifts (practice_id);
CREATE INDEX IF NOT EXISTS idx_shifts_employee_id ON shifts (employee_id);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts (date);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- Members can see shifts in their practice
DROP POLICY IF EXISTS shifts_select_practice_member ON shifts;
CREATE POLICY shifts_select_practice_member
  ON shifts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = shifts.practice_id
        AND pm.user_id = auth.uid()
    )
  );

-- Admins can insert shifts
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
  );

-- Admins can update shifts
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
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = shifts.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- Admins can delete shifts
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
  );

-- ============================================================
-- Phase 3: HR Documents
-- ============================================================

CREATE TABLE IF NOT EXISTS hr_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN ('contract', 'payslip', 'certificate', 'training', 'other')),
  title       TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_documents_practice_id ON hr_documents (practice_id);
CREATE INDEX IF NOT EXISTS idx_hr_documents_employee_id ON hr_documents (employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_documents_category ON hr_documents (category);

ALTER TABLE hr_documents ENABLE ROW LEVEL SECURITY;

-- Members can see their own documents, admins can see all
DROP POLICY IF EXISTS hr_documents_select ON hr_documents;
CREATE POLICY hr_documents_select
  ON hr_documents FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = hr_documents.employee_id
        AND e.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = hr_documents.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- Admins can insert documents
DROP POLICY IF EXISTS hr_documents_insert_admin ON hr_documents;
CREATE POLICY hr_documents_insert_admin
  ON hr_documents FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = hr_documents.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- Admins can delete documents
DROP POLICY IF EXISTS hr_documents_delete_admin ON hr_documents;
CREATE POLICY hr_documents_delete_admin
  ON hr_documents FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = hr_documents.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- Phase 4: Onboarding Tasks
-- ============================================================

CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  done        BOOLEAN NOT NULL DEFAULT false,
  due_on      DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_practice_id ON onboarding_tasks (practice_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_employee_id ON onboarding_tasks (employee_id);

ALTER TABLE onboarding_tasks ENABLE ROW LEVEL SECURITY;

-- Members can see their own onboarding tasks, admins can see all
DROP POLICY IF EXISTS onboarding_tasks_select ON onboarding_tasks;
CREATE POLICY onboarding_tasks_select
  ON onboarding_tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = onboarding_tasks.employee_id
        AND e.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = onboarding_tasks.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- Admins can create onboarding tasks
DROP POLICY IF EXISTS onboarding_tasks_insert_admin ON onboarding_tasks;
CREATE POLICY onboarding_tasks_insert_admin
  ON onboarding_tasks FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = onboarding_tasks.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- Members can update their own tasks (mark done), admins all
DROP POLICY IF EXISTS onboarding_tasks_update ON onboarding_tasks;
CREATE POLICY onboarding_tasks_update
  ON onboarding_tasks FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = onboarding_tasks.employee_id
        AND e.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = onboarding_tasks.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = onboarding_tasks.employee_id
        AND e.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = onboarding_tasks.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- Admins can delete onboarding tasks
DROP POLICY IF EXISTS onboarding_tasks_delete_admin ON onboarding_tasks;
CREATE POLICY onboarding_tasks_delete_admin
  ON onboarding_tasks FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = onboarding_tasks.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- Supabase Storage: hr-documents bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('hr-documents', 'hr-documents', false)
ON CONFLICT (id) DO NOTHING;
