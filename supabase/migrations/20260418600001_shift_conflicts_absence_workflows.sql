-- ============================================================
-- Phase 6: Dienstplan-Konflikte & Abwesenheits-Workflows
-- ============================================================

-- ==========================================
-- 1. Schicht-Regeln
-- ==========================================

CREATE TABLE IF NOT EXISTS shift_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  rule_type       TEXT NOT NULL CHECK (rule_type IN ('max_hours_day', 'max_hours_week', 'min_rest_hours', 'min_staffing')),
  parameters      JSONB NOT NULL DEFAULT '{}',
  -- max_hours_day: { "hours": 10 }
  -- max_hours_week: { "hours": 48 }
  -- min_rest_hours: { "hours": 11 }
  -- min_staffing: { "count": 2, "location_id": "...", "shift_type": "..." }
  location_id     UUID REFERENCES practice_units(id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shift_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shift_rules_select ON shift_rules;
CREATE POLICY shift_rules_select
  ON shift_rules FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = shift_rules.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS shift_rules_manage ON shift_rules;
CREATE POLICY shift_rules_manage
  ON shift_rules FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = shift_rules.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = shift_rules.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- ==========================================
-- 2. Konfliktprüfung als DB-Function
-- ==========================================

CREATE OR REPLACE FUNCTION check_shift_conflicts(
  p_practice_id UUID,
  p_employee_id UUID,
  p_date DATE,
  p_starts_at TIME,
  p_ends_at TIME,
  p_exclude_shift_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  conflicts JSONB := '[]'::JSONB;
  shift_hours NUMERIC;
  total_day_hours NUMERIC;
BEGIN
  shift_hours := EXTRACT(EPOCH FROM (p_ends_at - p_starts_at)) / 3600.0;

  -- 1. Check overlapping shifts for same employee
  IF EXISTS (
    SELECT 1 FROM shifts s
    WHERE s.practice_id = p_practice_id
      AND s.employee_id = p_employee_id
      AND s.date = p_date
      AND (p_exclude_shift_id IS NULL OR s.id != p_exclude_shift_id)
      AND s.starts_at < p_ends_at
      AND s.ends_at > p_starts_at
  ) THEN
    conflicts := conflicts || jsonb_build_object('type', 'overlap', 'message', 'Überlappende Schicht am selben Tag');
  END IF;

  -- 2. Check absence on same date
  IF EXISTS (
    SELECT 1 FROM absences a
    WHERE a.employee_id = p_employee_id
      AND a.status != 'rejected'
      AND a.starts_on <= p_date
      AND a.ends_on >= p_date
  ) THEN
    conflicts := conflicts || jsonb_build_object('type', 'absence', 'message', 'Abwesenheit am selben Tag gemeldet');
  END IF;

  -- 3. Check max daily hours
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (s.ends_at - s.starts_at)) / 3600.0), 0)
  INTO total_day_hours
  FROM shifts s
  WHERE s.practice_id = p_practice_id
    AND s.employee_id = p_employee_id
    AND s.date = p_date
    AND (p_exclude_shift_id IS NULL OR s.id != p_exclude_shift_id);

  IF (total_day_hours + shift_hours) > 10 THEN
    conflicts := conflicts || jsonb_build_object('type', 'max_hours', 'message',
      format('Tagesarbeitszeit überschritten: %.1fh (max 10h)', total_day_hours + shift_hours));
  END IF;

  -- 4. Check missing qualification
  IF EXISTS (
    SELECT 1 FROM qualifications q
    WHERE q.practice_id = p_practice_id
      AND q.is_required_for_scheduling = true
      AND NOT EXISTS (
        SELECT 1 FROM employee_qualifications eq
        WHERE eq.employee_id = p_employee_id
          AND eq.qualification_id = q.id
          AND eq.status = 'active'
      )
  ) THEN
    conflicts := conflicts || jsonb_build_object('type', 'qualification', 'message', 'Fehlende dienstplan-relevante Qualifikation');
  END IF;

  RETURN conflicts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ==========================================
-- 3. Abwesenheits-Änderungsanträge
-- ==========================================

CREATE TABLE IF NOT EXISTS absence_modifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id           UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  absence_id            UUID NOT NULL REFERENCES absences(id) ON DELETE CASCADE,
  employee_id           UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  modification_type     TEXT NOT NULL CHECK (modification_type IN ('change_dates', 'cancel')),
  new_starts_on         DATE,
  new_ends_on           DATE,
  reason                TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  -- Admin counter-proposal
  alternative_starts_on DATE,
  alternative_ends_on   DATE,
  alternative_note      TEXT,
  reviewed_by           UUID REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_absence_mods_absence ON absence_modifications (absence_id);
CREATE INDEX IF NOT EXISTS idx_absence_mods_status ON absence_modifications (practice_id, status);

ALTER TABLE absence_modifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS absence_mods_select ON absence_modifications;
CREATE POLICY absence_mods_select
  ON absence_modifications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = absence_modifications.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS absence_mods_insert ON absence_modifications;
CREATE POLICY absence_mods_insert
  ON absence_modifications FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = absence_modifications.employee_id
        AND e.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS absence_mods_update ON absence_modifications;
CREATE POLICY absence_mods_update
  ON absence_modifications FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = absence_modifications.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin', 'groupleader')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = absence_modifications.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin', 'groupleader')
    )
  );

-- ==========================================
-- 4. Krankmeldungs-Erweiterung
-- ==========================================

ALTER TABLE absences ADD COLUMN IF NOT EXISTS sick_note_status TEXT
  CHECK (sick_note_status IN ('none', 'submitted', 'verified'));
ALTER TABLE absences ADD COLUMN IF NOT EXISTS sick_note_document_id UUID
  REFERENCES hr_documents(id) ON DELETE SET NULL;
