-- Registration form configuration + consent audit storage.

CREATE TABLE IF NOT EXISTS registration_form_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  registration_title text NOT NULL DEFAULT 'Konto erstellen',
  registration_subtitle text NOT NULL DEFAULT 'Bitte Registrierungsdaten vollständig ausfüllen.',
  require_first_name boolean NOT NULL DEFAULT true,
  require_last_name boolean NOT NULL DEFAULT true,
  require_terms boolean NOT NULL DEFAULT true,
  require_privacy boolean NOT NULL DEFAULT true,
  allow_product_updates boolean NOT NULL DEFAULT true,
  min_password_length integer NOT NULL DEFAULT 10,
  require_uppercase boolean NOT NULL DEFAULT true,
  require_lowercase boolean NOT NULL DEFAULT true,
  require_digit boolean NOT NULL DEFAULT true,
  require_special_char boolean NOT NULL DEFAULT true,
  terms_label text NOT NULL DEFAULT 'AGB akzeptieren (Pflicht)',
  privacy_label text NOT NULL DEFAULT 'Datenschutz akzeptieren (Pflicht)',
  product_updates_label text NOT NULL DEFAULT 'Produkt-Updates per E-Mail erhalten (optional)',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_registration_form_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_registration_form_settings_updated_at ON registration_form_settings;
CREATE TRIGGER trg_registration_form_settings_updated_at
BEFORE UPDATE ON registration_form_settings
FOR EACH ROW
EXECUTE FUNCTION set_registration_form_settings_updated_at();

ALTER TABLE registration_form_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS registration_form_settings_select_public ON registration_form_settings;
CREATE POLICY registration_form_settings_select_public
ON registration_form_settings FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS registration_form_settings_write_admin ON registration_form_settings;
CREATE POLICY registration_form_settings_write_admin
ON registration_form_settings FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM practice_memberships pm
    WHERE pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM practice_memberships pm
    WHERE pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'admin')
  )
);

INSERT INTO registration_form_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  practice_id uuid REFERENCES practices(id) ON DELETE SET NULL,
  consent_type text NOT NULL,
  accepted boolean NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'registration',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user_id ON user_consents (user_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_practice_id ON user_consents (practice_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_created_at ON user_consents (created_at DESC);

ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_consents_select_own_or_admin ON user_consents;
CREATE POLICY user_consents_select_own_or_admin
ON user_consents FOR SELECT
TO authenticated
USING (
  user_consents.user_id = auth.uid()
  OR (
    user_consents.practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = user_consents.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
);

DROP POLICY IF EXISTS user_consents_insert_own ON user_consents;
CREATE POLICY user_consents_insert_own
ON user_consents FOR INSERT
TO authenticated
WITH CHECK (
  user_consents.user_id = auth.uid()
  AND (
    user_consents.practice_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = user_consents.practice_id
        AND pm.user_id = auth.uid()
    )
  )
);
