-- ============================================================
-- Einladungssystem: MA-Datensatz mit User-Account verknüpfen
-- ============================================================

-- 1. Einladungs-Token pro Mitarbeiter
ALTER TABLE employees ADD COLUMN IF NOT EXISTS invite_token TEXT UNIQUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS invite_email TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_employees_invite_token
  ON employees (invite_token) WHERE invite_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_invite_email
  ON employees (invite_email) WHERE invite_email IS NOT NULL;

-- 2. Function: Einladung annehmen
-- Verknüpft einen registrierten User mit einem bestehenden MA-Datensatz
CREATE OR REPLACE FUNCTION accept_employee_invitation(p_invite_token TEXT)
RETURNS UUID AS $$
DECLARE
  v_employee RECORD;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet.';
  END IF;

  -- Find employee by token
  SELECT * INTO v_employee
  FROM employees
  WHERE invite_token = p_invite_token
    AND user_id IS NULL;  -- nur unverknüpfte MA

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ungültiger oder bereits verwendeter Einladungslink.';
  END IF;

  -- Link user to employee
  UPDATE employees
  SET user_id = v_user_id,
      invite_token = NULL,  -- Token verbrauchen
      employment_status = CASE
        WHEN employment_status = 'onboarding' THEN 'active'
        ELSE employment_status
      END
  WHERE id = v_employee.id;

  -- Ensure practice_membership exists
  INSERT INTO practice_memberships (practice_id, user_id, role)
  VALUES (
    v_employee.practice_id,
    v_user_id,
    CASE WHEN v_employee.role = 'admin' THEN 'admin'
         WHEN v_employee.role = 'groupleader' THEN 'groupleader'
         ELSE 'member'
    END
  )
  ON CONFLICT (practice_id, user_id) DO NOTHING;

  RETURN v_employee.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION accept_employee_invitation(TEXT) TO authenticated;

-- 3. Function: Bei Registrierung automatisch per E-Mail matchen
-- Wird von getOrCreateEmployee aufgerufen
CREATE OR REPLACE FUNCTION link_employee_by_email(p_practice_id UUID, p_user_id UUID, p_email TEXT)
RETURNS UUID AS $$
DECLARE
  v_employee_id UUID;
BEGIN
  -- Suche unverknüpften MA mit derselben E-Mail
  SELECT id INTO v_employee_id
  FROM employees
  WHERE practice_id = p_practice_id
    AND user_id IS NULL
    AND (invite_email = lower(p_email) OR email_private = lower(p_email))
  LIMIT 1;

  IF v_employee_id IS NOT NULL THEN
    UPDATE employees
    SET user_id = p_user_id,
        invite_token = NULL,
        employment_status = CASE
          WHEN employment_status = 'onboarding' THEN 'active'
          ELSE employment_status
        END
    WHERE id = v_employee_id;
  END IF;

  RETURN v_employee_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION link_employee_by_email(UUID, UUID, TEXT) TO authenticated;
