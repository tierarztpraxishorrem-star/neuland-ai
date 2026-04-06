-- Lightweight patient container for consultation context and history.

CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tierart TEXT,
  rasse TEXT,
  alter TEXT,
  geschlecht TEXT,
  external_id TEXT,
  owner_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patients_tierart_check CHECK (tierart IS NULL OR tierart IN ('Hund', 'Katze', 'Heimtier')),
  CONSTRAINT patients_geschlecht_check CHECK (geschlecht IS NULL OR geschlecht IN ('m', 'w', 'mk', 'wk'))
);

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patients_select_authenticated ON patients;
CREATE POLICY patients_select_authenticated
  ON patients
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS patients_insert_authenticated ON patients;
CREATE POLICY patients_insert_authenticated
  ON patients
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS patients_update_authenticated ON patients;
CREATE POLICY patients_update_authenticated
  ON patients
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS patients_delete_authenticated ON patients;
CREATE POLICY patients_delete_authenticated
  ON patients
  FOR DELETE
  TO authenticated
  USING (true);

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_name ON patients (lower(name));
CREATE INDEX IF NOT EXISTS idx_patients_external_id ON patients (lower(external_id));
CREATE INDEX IF NOT EXISTS idx_patients_created_at ON patients (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_patient_id ON cases (patient_id);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases (created_at DESC);
