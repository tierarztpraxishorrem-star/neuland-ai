-- ============================================================
-- Phase 1: Standorte aktivieren für HR
-- ============================================================

-- 1. practice_units um HR-relevante Felder erweitern
ALTER TABLE practice_units ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE practice_units ADD COLUMN IF NOT EXISTS address_zip    TEXT;
ALTER TABLE practice_units ADD COLUMN IF NOT EXISTS address_city   TEXT;
ALTER TABLE practice_units ADD COLUMN IF NOT EXISTS phone          TEXT;
ALTER TABLE practice_units ADD COLUMN IF NOT EXISTS email          TEXT;
ALTER TABLE practice_units ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT true;

-- 2. shifts um location_id erweitern
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES practice_units(id) ON DELETE SET NULL;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shift_type  TEXT CHECK (shift_type IN ('frueh', 'spaet', 'nacht', 'bereitschaft', 'normal'));

CREATE INDEX IF NOT EXISTS idx_shifts_location ON shifts (location_id) WHERE location_id IS NOT NULL;

-- 3. work_sessions um location_id erweitern
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES practice_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_sessions_location ON work_sessions (location_id) WHERE location_id IS NOT NULL;

-- 4. employees.location_id FK nachträglich setzen (Spalte wurde in Phase 0 angelegt)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'employees_location_id_fkey'
      AND table_name = 'employees'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_location_id_fkey
      FOREIGN KEY (location_id) REFERENCES practice_units(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Standort-Index
CREATE INDEX IF NOT EXISTS idx_practice_units_active
  ON practice_units (practice_id, is_active);
