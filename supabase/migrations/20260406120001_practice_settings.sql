-- Practice settings for branded PDF export.

CREATE TABLE IF NOT EXISTS practice_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  practice_name text,
  address text,
  phone text,
  email text,
  logo_data_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_practice_settings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_practice_settings_updated_at ON practice_settings;
CREATE TRIGGER trg_practice_settings_updated_at
BEFORE UPDATE ON practice_settings
FOR EACH ROW
EXECUTE FUNCTION set_practice_settings_updated_at();

ALTER TABLE practice_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "practice_settings_read" ON practice_settings;
CREATE POLICY "practice_settings_read"
ON practice_settings FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "practice_settings_write" ON practice_settings;
CREATE POLICY "practice_settings_write"
ON practice_settings FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
