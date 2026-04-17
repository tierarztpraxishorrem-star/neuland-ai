-- Individuelle Verlauf-Parameter pro Stationspatient
CREATE TABLE IF NOT EXISTS station_vital_params (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_patient_id  UUID NOT NULL REFERENCES station_patients(id) ON DELETE CASCADE,
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  label               TEXT NOT NULL,
  unit                TEXT,
  is_required         BOOLEAN DEFAULT false,
  sort_order          INT DEFAULT 0,
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS station_vital_custom_values (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  param_id            UUID NOT NULL REFERENCES station_vital_params(id) ON DELETE CASCADE,
  station_patient_id  UUID NOT NULL REFERENCES station_patients(id) ON DELETE CASCADE,
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  measured_hour       INT NOT NULL,
  measured_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  value               TEXT NOT NULL,
  recorded_by         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_station_vital_params_patient
  ON station_vital_params(station_patient_id, is_active);
CREATE INDEX IF NOT EXISTS idx_station_vital_custom_values_patient
  ON station_vital_custom_values(station_patient_id, measured_date);

ALTER TABLE station_vital_params ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_vital_custom_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY station_vital_params_all ON station_vital_params FOR ALL TO authenticated
  USING (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()))
  WITH CHECK (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()));

CREATE POLICY station_vital_custom_values_all ON station_vital_custom_values FOR ALL TO authenticated
  USING (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()))
  WITH CHECK (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()));
