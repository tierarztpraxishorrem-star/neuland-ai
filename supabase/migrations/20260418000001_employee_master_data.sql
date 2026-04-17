-- ============================================================
-- Phase 0: Erweiterte Mitarbeiter-Stammdaten
-- ============================================================

-- Persönliche Daten
ALTER TABLE employees ADD COLUMN IF NOT EXISTS first_name        TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_name         TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS birth_name        TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_of_birth     DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS birth_place       TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS birth_country     TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender            TEXT CHECK (gender IN ('male', 'female', 'diverse', 'unknown'));
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nationality       TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS marital_status    TEXT CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed', 'registered_partnership', 'unknown'));
ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone             TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS email_private     TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address_street    TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address_number    TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address_zip       TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address_city      TEXT;

-- Vertragsdaten
ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_type     TEXT CHECK (contract_type IN ('vollzeit', 'teilzeit', 'minijob', 'azubi', 'praktikant', 'werkstudent'));
ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_start    DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_end      DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS probation_end     DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS weekly_hours_target NUMERIC(5,2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_days_per_week SMALLINT DEFAULT 5 CHECK (work_days_per_week BETWEEN 1 AND 7);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS vacation_days_per_year SMALLINT DEFAULT 30;

-- Steuer- / Sozialversicherungsdaten (sensibel!)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS iban                    TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bic                     TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tax_id                  TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tax_class               SMALLINT CHECK (tax_class BETWEEN 1 AND 6);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS social_security_number  TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS health_insurance        TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS confession              TEXT;

-- HR-Organisationsfelder
ALTER TABLE employees ADD COLUMN IF NOT EXISTS personnel_number  TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department        TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS position_title    TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS supervisor_id     UUID REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS location_id       UUID;

-- Employment-Status erweitern (bestehende Werte beibehalten + neue)
-- Da CHECK constraints auf employment_status evtl. schon existieren, droppen wir
-- den alten und setzen einen neuen.
DO $$
BEGIN
  -- Drop existing check constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'employees' AND column_name = 'employment_status'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE employees DROP CONSTRAINT ' || constraint_name
      FROM information_schema.constraint_column_usage
      WHERE table_name = 'employees' AND column_name = 'employment_status'
      LIMIT 1
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignore if no constraint exists
  NULL;
END $$;

ALTER TABLE employees
  ADD CONSTRAINT employees_employment_status_check
  CHECK (employment_status IN ('active', 'inactive', 'onboarding', 'offboarding', 'terminated'));

-- Indices für häufige Abfragen
CREATE INDEX IF NOT EXISTS idx_employees_practice_status
  ON employees (practice_id, employment_status);
CREATE INDEX IF NOT EXISTS idx_employees_personnel_number
  ON employees (practice_id, personnel_number)
  WHERE personnel_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_supervisor
  ON employees (supervisor_id)
  WHERE supervisor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_location
  ON employees (location_id)
  WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_name_search
  ON employees (practice_id, last_name, first_name);

-- Audit-Trigger: Stammdaten-Änderungen protokollieren
CREATE OR REPLACE FUNCTION hr_audit_employee_changes()
RETURNS TRIGGER AS $$
DECLARE
  col TEXT;
  old_val TEXT;
  new_val TEXT;
BEGIN
  -- Nur bei UPDATE und wenn sich relevante Felder geändert haben
  IF TG_OP = 'UPDATE' THEN
    FOREACH col IN ARRAY ARRAY[
      'first_name','last_name','date_of_birth','gender','address_street',
      'address_city','address_zip','iban','bic','tax_id','tax_class',
      'social_security_number','health_insurance','contract_type',
      'contract_start','contract_end','weekly_hours_target','employment_status',
      'department','position_title','supervisor_id','location_id','personnel_number'
    ] LOOP
      EXECUTE format('SELECT ($1).%I::TEXT, ($2).%I::TEXT', col, col)
        INTO old_val, new_val
        USING OLD, NEW;
      IF old_val IS DISTINCT FROM new_val THEN
        INSERT INTO hr_audit_log (practice_id, actor_user_id, action, entity_type, entity_id, metadata)
        VALUES (
          NEW.practice_id,
          NEW.user_id,
          'update',
          'employee',
          NEW.id,
          jsonb_build_object('field', col, 'old_value', old_val, 'new_value', new_val)
        );
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger nur erstellen, wenn hr_audit_log Tabelle existiert
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hr_audit_log') THEN
    DROP TRIGGER IF EXISTS trg_employee_audit ON employees;
    CREATE TRIGGER trg_employee_audit
      AFTER UPDATE ON employees
      FOR EACH ROW
      EXECUTE FUNCTION hr_audit_employee_changes();
  END IF;
END $$;
