-- Mess-Zeiten pro Vital-Parameter (Standard + Custom).
-- Wie bei Medikamenten: scheduled_hours[] enthält die Stunden (0-23),
-- zu denen der Wert gemessen werden soll.

-- Standard-Vitals: scheduled_hours direkt in station_vitals-Logik (kein extra Feld nötig,
-- weil HF/AF/Temp etc. statisch pro Patient sind → neues Feld in station_patients).
-- Custom-Vitals: scheduled_hours in station_vital_params.

-- 1. scheduled_hours für Custom-Vitals
ALTER TABLE station_vital_params
  ADD COLUMN IF NOT EXISTS scheduled_hours INT[] DEFAULT '{}';

-- 2. Standard-Vital-Schedule pro Patient
-- Jede Zeile = ein Standard-Parameter (heart_rate, resp_rate, temp, pain, feces, urine, notes)
-- mit geplanten Stunden + highlight-flag.
CREATE TABLE IF NOT EXISTS station_vital_schedule (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_patient_id  UUID NOT NULL REFERENCES station_patients(id) ON DELETE CASCADE,
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  param_key           TEXT NOT NULL,   -- heart_rate | resp_rate | temperature_c | pain_score | feces | urine | notes
  scheduled_hours     INT[] NOT NULL DEFAULT '{}',
  is_highlighted      BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT station_vital_schedule_unique UNIQUE (station_patient_id, param_key)
);

CREATE INDEX IF NOT EXISTS idx_station_vital_schedule_patient
  ON station_vital_schedule(station_patient_id);

ALTER TABLE station_vital_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY station_vital_schedule_all ON station_vital_schedule FOR ALL TO authenticated
  USING (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()))
  WITH CHECK (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()));

-- 3. Schichtübergabe-Notizen
CREATE TABLE IF NOT EXISTS station_shift_handoffs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_patient_id  UUID REFERENCES station_patients(id) ON DELETE CASCADE,
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  shift_label         TEXT,              -- "Frühschicht → Spätschicht"
  transcript          TEXT NOT NULL,     -- Transkription der Aufnahme
  audio_url           TEXT,              -- optional, falls Audio gespeichert
  recorded_by         TEXT,              -- Kürzel oder Name
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_station_shift_handoffs_patient
  ON station_shift_handoffs(station_patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_station_shift_handoffs_practice
  ON station_shift_handoffs(practice_id, created_at DESC);

ALTER TABLE station_shift_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY station_shift_handoffs_all ON station_shift_handoffs FOR ALL TO authenticated
  USING (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()))
  WITH CHECK (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()));

-- 4. Pflegeprotokoll
CREATE TABLE IF NOT EXISTS station_care_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_patient_id  UUID NOT NULL REFERENCES station_patients(id) ON DELETE CASCADE,
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  care_type           TEXT NOT NULL CHECK (care_type IN (
    'wound_care', 'catheter_care', 'bandage_change', 'mobilization',
    'hygiene', 'monitoring', 'feeding', 'other'
  )),
  body_location       TEXT,
  notes               TEXT,
  recorded_by         TEXT,
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_station_care_log_patient
  ON station_care_log(station_patient_id, created_at DESC);

ALTER TABLE station_care_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY station_care_log_all ON station_care_log FOR ALL TO authenticated
  USING (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()))
  WITH CHECK (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()));

-- 5. Futter-/Flüssigkeits-Tracker (detaillierter als food_offered/eaten in station_vitals)
CREATE TABLE IF NOT EXISTS station_feeding_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_patient_id  UUID NOT NULL REFERENCES station_patients(id) ON DELETE CASCADE,
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  food_type           TEXT,              -- z.B. "Hills i/d", "Rehydrierung", "Infusion"
  amount_offered_ml   NUMERIC,
  amount_eaten_ml     NUMERIC,
  tolerance           TEXT CHECK (tolerance IS NULL OR tolerance IN ('good', 'partial', 'refused', 'vomited')),
  route               TEXT CHECK (route IS NULL OR route IN ('oral', 'tube', 'iv')),
  notes               TEXT,
  recorded_by         TEXT,
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_station_feeding_log_patient
  ON station_feeding_log(station_patient_id, created_at DESC);

ALTER TABLE station_feeding_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY station_feeding_log_all ON station_feeding_log FOR ALL TO authenticated
  USING (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()))
  WITH CHECK (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()));

-- 6. Medikamenten-Audit-Log
CREATE TABLE IF NOT EXISTS station_med_audit_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_patient_id  UUID NOT NULL REFERENCES station_patients(id) ON DELETE CASCADE,
  medication_id       UUID REFERENCES station_medications(id) ON DELETE SET NULL,
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  action              TEXT NOT NULL CHECK (action IN (
    'created', 'updated', 'deactivated', 'administered', 'skipped', 'delayed',
    'dose_changed', 'schedule_changed', 'reactivated'
  )),
  details             JSONB,
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_initials       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_station_med_audit_patient
  ON station_med_audit_log(station_patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_station_med_audit_med
  ON station_med_audit_log(medication_id, created_at DESC);

ALTER TABLE station_med_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY station_med_audit_log_read ON station_med_audit_log FOR SELECT TO authenticated
  USING (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()));

-- Nur Insert (kein Update/Delete — Audit-Daten sind unveränderlich)
CREATE POLICY station_med_audit_log_insert ON station_med_audit_log FOR INSERT TO authenticated
  WITH CHECK (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()));

-- 7. Doppel-Check für Hochrisiko-Medikamente
ALTER TABLE station_medications
  ADD COLUMN IF NOT EXISTS requires_double_check BOOLEAN DEFAULT false;

-- 8. Station ↔ Case Verknüpfung
ALTER TABLE station_patients
  ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES cases(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_station_patients_case ON station_patients(case_id) WHERE case_id IS NOT NULL;

-- 9. Tägliche Routine-Checkliste pro Stationspatient
-- Items werden täglich zurückgesetzt; im TV-Modus als "offen" angezeigt bis erledigt.
CREATE TABLE IF NOT EXISTS station_daily_tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_patient_id  UUID NOT NULL REFERENCES station_patients(id) ON DELETE CASCADE,
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  label               TEXT NOT NULL,       -- z.B. "Untersucht", "Karteineintrag + Abrechnung"
  is_default          BOOLEAN DEFAULT true, -- Standard-Aufgaben vs. individuelle
  sort_order          INT DEFAULT 0,
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS station_daily_checks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id             UUID NOT NULL REFERENCES station_daily_tasks(id) ON DELETE CASCADE,
  station_patient_id  UUID NOT NULL REFERENCES station_patients(id) ON DELETE CASCADE,
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  check_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  checked_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_by          TEXT,               -- Kürzel
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes               TEXT,               -- z.B. "Abholung 16:00" oder "bleibt bis mind. Freitag"
  CONSTRAINT station_daily_checks_unique UNIQUE (task_id, check_date)
);

CREATE INDEX IF NOT EXISTS idx_station_daily_tasks_patient
  ON station_daily_tasks(station_patient_id, is_active);
CREATE INDEX IF NOT EXISTS idx_station_daily_checks_date
  ON station_daily_checks(station_patient_id, check_date);

ALTER TABLE station_daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_daily_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY station_daily_tasks_all ON station_daily_tasks FOR ALL TO authenticated
  USING (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()))
  WITH CHECK (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()));

CREATE POLICY station_daily_checks_all ON station_daily_checks FOR ALL TO authenticated
  USING (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()))
  WITH CHECK (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()));
