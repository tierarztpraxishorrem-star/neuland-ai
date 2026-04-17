-- Stationspatienten
CREATE TABLE IF NOT EXISTS station_patients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  patient_id      UUID REFERENCES patients(id) ON DELETE SET NULL,
  -- Patientendaten (manuell oder aus Patientensystem)
  patient_name    TEXT NOT NULL,
  patient_number  TEXT,
  chip_number     TEXT,
  species         TEXT,
  breed           TEXT,
  birth_date      DATE,
  gender          TEXT CHECK (gender IN ('männlich', 'weiblich', 'männlich kastriert', 'weiblich kastriert')),
  owner_name      TEXT,
  weight_kg       NUMERIC(6,2),
  -- Stationsdaten
  box_number      TEXT,
  station_day     INT NOT NULL DEFAULT 1,
  admission_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  discharge_date  DATE,
  -- Medizinische Infos
  diagnosis       TEXT,
  problems        TEXT,
  cave            BOOLEAN DEFAULT false,
  cave_details    TEXT,
  -- Pflegehilfsmittel
  has_collar      BOOLEAN DEFAULT false,
  has_iv_catheter BOOLEAN DEFAULT false,
  iv_catheter_location TEXT,
  iv_catheter_date DATE,
  -- Ernährung
  diet_type       TEXT,
  diet_notes      TEXT,
  -- Energie
  rer_kcal        NUMERIC(8,2),
  maintenance_ml_per_h NUMERIC(6,2),
  -- Reanimation
  dnr             BOOLEAN DEFAULT false,
  -- Status
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'discharged', 'transferred', 'deceased')),
  -- Verantwortliche
  responsible_vet TEXT,
  responsible_tfa TEXT,
  -- Timestamps
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Medikamentenpläne
CREATE TABLE IF NOT EXISTS station_medications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_patient_id UUID NOT NULL REFERENCES station_patients(id) ON DELETE CASCADE,
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  dose            TEXT NOT NULL,
  dose_mg_per_kg  NUMERIC(8,3),
  route           TEXT,
  scheduled_hours INT[] NOT NULL DEFAULT '{}',
  frequency_label TEXT,
  is_prn          BOOLEAN DEFAULT false,
  is_dti          BOOLEAN DEFAULT false,
  dti_rate_ml_h   NUMERIC(6,2),
  is_active       BOOLEAN DEFAULT true,
  valid_from      TIMESTAMPTZ DEFAULT now(),
  valid_to        TIMESTAMPTZ,
  ordered_by      TEXT,
  notes           TEXT,
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Medikamentengaben (Abzeichnungen)
CREATE TABLE IF NOT EXISTS station_med_administrations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id       UUID NOT NULL REFERENCES station_medications(id) ON DELETE CASCADE,
  station_patient_id  UUID NOT NULL REFERENCES station_patients(id) ON DELETE CASCADE,
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  scheduled_hour      INT NOT NULL,
  administered_at     TIMESTAMPTZ,
  administered_by     TEXT NOT NULL,
  user_id             UUID,
  status              TEXT NOT NULL DEFAULT 'given'
                      CHECK (status IN ('given', 'skipped', 'delayed')),
  skip_reason         TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stündliche Messungen
CREATE TABLE IF NOT EXISTS station_vitals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_patient_id  UUID NOT NULL REFERENCES station_patients(id) ON DELETE CASCADE,
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  measured_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  measured_hour       INT NOT NULL,
  heart_rate          INT,
  resp_rate           INT,
  temperature_c       NUMERIC(4,1),
  mucous_membrane     TEXT,
  crt_seconds         NUMERIC(3,1),
  pain_score          INT CHECK (pain_score BETWEEN 0 AND 10),
  food_offered        BOOLEAN,
  food_eaten          BOOLEAN,
  water_offered       BOOLEAN,
  feces_amount        TEXT,
  feces_color         TEXT,
  feces_consistency   TEXT,
  urine               TEXT,
  notes               TEXT,
  recorded_by         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- KI-Sicherheitswarnungen
CREATE TABLE IF NOT EXISTS station_ai_alerts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_patient_id  UUID NOT NULL REFERENCES station_patients(id) ON DELETE CASCADE,
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  alert_type          TEXT NOT NULL CHECK (alert_type IN (
    'dose_too_high', 'dose_too_low', 'interaction', 'allergy',
    'missing_info', 'unusual_combination', 'weight_mismatch'
  )),
  severity            TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  medication_id       UUID REFERENCES station_medications(id),
  message             TEXT NOT NULL,
  details             TEXT,
  is_acknowledged     BOOLEAN DEFAULT false,
  acknowledged_by     TEXT,
  acknowledged_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indizes
CREATE INDEX IF NOT EXISTS idx_station_patients_practice_status
  ON station_patients(practice_id, status);
CREATE INDEX IF NOT EXISTS idx_station_medications_patient
  ON station_medications(station_patient_id, is_active);
CREATE INDEX IF NOT EXISTS idx_station_admins_patient_hour
  ON station_med_administrations(station_patient_id, scheduled_hour);
CREATE INDEX IF NOT EXISTS idx_station_vitals_patient
  ON station_vitals(station_patient_id, measured_at DESC);

-- RLS
ALTER TABLE station_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_med_administrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_ai_alerts ENABLE ROW LEVEL SECURITY;

-- Policies: Praxis-Mitglieder dürfen alles
CREATE POLICY station_patients_all ON station_patients FOR ALL TO authenticated
  USING (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()))
  WITH CHECK (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()));

CREATE POLICY station_medications_all ON station_medications FOR ALL TO authenticated
  USING (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()))
  WITH CHECK (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()));

CREATE POLICY station_admins_all ON station_med_administrations FOR ALL TO authenticated
  USING (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()))
  WITH CHECK (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()));

CREATE POLICY station_vitals_all ON station_vitals FOR ALL TO authenticated
  USING (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()))
  WITH CHECK (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()));

CREATE POLICY station_alerts_all ON station_ai_alerts FOR ALL TO authenticated
  USING (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()))
  WITH CHECK (practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid()));
