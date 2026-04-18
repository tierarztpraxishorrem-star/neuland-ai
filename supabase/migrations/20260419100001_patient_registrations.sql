-- Neukundenregistrierungen
CREATE TABLE IF NOT EXISTS patient_registrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id       UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  salutation        TEXT,
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  birth_date        DATE,
  street            TEXT,
  house_number      TEXT,
  zip               TEXT,
  city              TEXT,
  phone             TEXT,
  email             TEXT NOT NULL,
  is_adult          BOOLEAN DEFAULT true,
  appointment_date  DATE,
  appointment_time  TEXT,
  referral_source   TEXT,
  referring_vet     TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processed', 'archived')),
  processed_by      UUID,
  processed_at      TIMESTAMPTZ,
  language          TEXT DEFAULT 'de',
  ip_address        TEXT,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tiere pro Registrierung
CREATE TABLE IF NOT EXISTS registration_animals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id       UUID NOT NULL REFERENCES patient_registrations(id) ON DELETE CASCADE,
  practice_id           UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  sort_order            INT NOT NULL DEFAULT 1,
  species               TEXT NOT NULL,
  name                  TEXT NOT NULL,
  breed                 TEXT,
  birth_date            DATE,
  gender                TEXT CHECK (gender IN ('männlich', 'weiblich')),
  is_castrated          BOOLEAN DEFAULT false,
  coat_color            TEXT,
  chip_number           TEXT,
  has_insurance         BOOLEAN DEFAULT false,
  insurance_company     TEXT,
  insurance_number      TEXT,
  wants_direct_billing  BOOLEAN DEFAULT false,
  wants_insurance_info  BOOLEAN DEFAULT false,
  assignment_signed     BOOLEAN DEFAULT false,
  assignment_signature_data TEXT,
  assignment_signed_at  TIMESTAMPTZ,
  assignment_pdf_path   TEXT,
  patient_id            UUID REFERENCES patients(id) ON DELETE SET NULL,
  easyvet_id            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registrations_practice
  ON patient_registrations(practice_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_registration_animals_reg
  ON registration_animals(registration_id);

ALTER TABLE patient_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_animals ENABLE ROW LEVEL SECURITY;

-- Öffentlich schreiben (Neukundenformular braucht kein Login)
CREATE POLICY registrations_insert ON patient_registrations
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY animals_insert ON registration_animals
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Nur Praxis-Mitglieder lesen
CREATE POLICY registrations_read ON patient_registrations
  FOR SELECT TO authenticated USING (
    practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid())
  );
CREATE POLICY animals_read ON registration_animals
  FOR SELECT TO authenticated USING (
    practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid())
  );

-- Admins dürfen updaten
CREATE POLICY registrations_update ON patient_registrations
  FOR UPDATE TO authenticated USING (
    practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );
CREATE POLICY animals_update ON registration_animals
  FOR UPDATE TO authenticated USING (
    practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member'))
  );
