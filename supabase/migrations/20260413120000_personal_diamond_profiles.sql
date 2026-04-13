-- Persoenlicher Diamant: persisted values profile per user.

CREATE TABLE IF NOT EXISTS personal_diamond_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  answers_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  scores_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_values_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  dominant_cluster text,
  summary_text text,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_diamond_profiles_user_id
  ON personal_diamond_profiles (user_id);

CREATE OR REPLACE FUNCTION set_personal_diamond_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_personal_diamond_profiles_updated_at ON personal_diamond_profiles;
CREATE TRIGGER trg_personal_diamond_profiles_updated_at
BEFORE UPDATE ON personal_diamond_profiles
FOR EACH ROW
EXECUTE FUNCTION set_personal_diamond_profiles_updated_at();

ALTER TABLE personal_diamond_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personal_diamond_profiles_select_own ON personal_diamond_profiles;
CREATE POLICY personal_diamond_profiles_select_own
ON personal_diamond_profiles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS personal_diamond_profiles_insert_own ON personal_diamond_profiles;
CREATE POLICY personal_diamond_profiles_insert_own
ON personal_diamond_profiles FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS personal_diamond_profiles_update_own ON personal_diamond_profiles;
CREATE POLICY personal_diamond_profiles_update_own
ON personal_diamond_profiles FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS personal_diamond_profiles_delete_own ON personal_diamond_profiles;
CREATE POLICY personal_diamond_profiles_delete_own
ON personal_diamond_profiles FOR DELETE
TO authenticated
USING (user_id = auth.uid());
