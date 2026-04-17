-- ============================================================
-- Phase 5: Onboarding-Templates, Offboarding, Qualifikationen
-- ============================================================

-- ==========================================
-- 1. Onboarding-Templates
-- ==========================================

CREATE TABLE IF NOT EXISTS onboarding_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  employee_group  TEXT NOT NULL DEFAULT 'standard'
    CHECK (employee_group IN ('standard', 'tfa', 'tierarzt', 'azubi', 'verwaltung', 'custom')),
  tasks           JSONB NOT NULL DEFAULT '[]',
  -- tasks format: [{ "title": "...", "category": "documents|it|training|equipment|introduction", "due_offset_days": 10, "assigned_role": "admin" }]
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_templates_practice
  ON onboarding_templates (practice_id, is_active);

ALTER TABLE onboarding_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_templates_select ON onboarding_templates;
CREATE POLICY onboarding_templates_select
  ON onboarding_templates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = onboarding_templates.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS onboarding_templates_manage ON onboarding_templates;
CREATE POLICY onboarding_templates_manage
  ON onboarding_templates FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = onboarding_templates.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = onboarding_templates.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- Erweitere onboarding_tasks um Kategorie, Zuweisungen, Template-Referenz
ALTER TABLE onboarding_tasks ADD COLUMN IF NOT EXISTS category TEXT
  CHECK (category IN ('documents', 'it', 'training', 'equipment', 'introduction', 'other'));
ALTER TABLE onboarding_tasks ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE onboarding_tasks ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES onboarding_templates(id) ON DELETE SET NULL;

-- ==========================================
-- 2. Offboarding
-- ==========================================

CREATE TABLE IF NOT EXISTS offboarding_processes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  employee_id         UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  initiated_by        UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  initiated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_working_day    DATE,
  exit_reason         TEXT,
  status              TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  remaining_vacation_days NUMERIC(5,1),
  overtime_balance_minutes INTEGER,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offboarding_practice
  ON offboarding_processes (practice_id, status);
CREATE INDEX IF NOT EXISTS idx_offboarding_employee
  ON offboarding_processes (employee_id);

ALTER TABLE offboarding_processes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offboarding_select ON offboarding_processes;
CREATE POLICY offboarding_select
  ON offboarding_processes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = offboarding_processes.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS offboarding_manage ON offboarding_processes;
CREATE POLICY offboarding_manage
  ON offboarding_processes FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = offboarding_processes.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = offboarding_processes.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

CREATE TABLE IF NOT EXISTS offboarding_tasks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offboarding_process_id UUID NOT NULL REFERENCES offboarding_processes(id) ON DELETE CASCADE,
  practice_id           UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  category              TEXT CHECK (category IN ('documents', 'access', 'equipment', 'handover', 'other')),
  done                  BOOLEAN NOT NULL DEFAULT false,
  done_at               TIMESTAMPTZ,
  done_by               UUID REFERENCES employees(id) ON DELETE SET NULL,
  due_on                DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offboarding_tasks_process
  ON offboarding_tasks (offboarding_process_id);

ALTER TABLE offboarding_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offboarding_tasks_select ON offboarding_tasks;
CREATE POLICY offboarding_tasks_select
  ON offboarding_tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = offboarding_tasks.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS offboarding_tasks_manage ON offboarding_tasks;
CREATE POLICY offboarding_tasks_manage
  ON offboarding_tasks FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = offboarding_tasks.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = offboarding_tasks.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- ==========================================
-- 3. Qualifikationen
-- ==========================================

CREATE TABLE IF NOT EXISTS qualifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('certification', 'license', 'training', 'skill')),
  description     TEXT,
  is_required_for_scheduling BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qualifications_practice
  ON qualifications (practice_id);

ALTER TABLE qualifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qualifications_select ON qualifications;
CREATE POLICY qualifications_select
  ON qualifications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = qualifications.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS qualifications_manage ON qualifications;
CREATE POLICY qualifications_manage
  ON qualifications FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = qualifications.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = qualifications.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

CREATE TABLE IF NOT EXISTS employee_qualifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id       UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  qualification_id  UUID NOT NULL REFERENCES qualifications(id) ON DELETE CASCADE,
  obtained_at       DATE,
  expires_at        DATE,
  document_id       UUID REFERENCES hr_documents(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'pending_renewal')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_qual_unique UNIQUE (employee_id, qualification_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_qualifications_employee
  ON employee_qualifications (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_qualifications_expires
  ON employee_qualifications (expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE employee_qualifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_qualifications_select ON employee_qualifications;
CREATE POLICY employee_qualifications_select
  ON employee_qualifications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employee_qualifications.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS employee_qualifications_manage ON employee_qualifications;
CREATE POLICY employee_qualifications_manage
  ON employee_qualifications FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employee_qualifications.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = employee_qualifications.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );
