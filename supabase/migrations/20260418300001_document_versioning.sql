-- ============================================================
-- Phase 3: Erweiterte Dokumente & Versionierung
-- ============================================================

-- 1. hr_documents erweitern
ALTER TABLE hr_documents ADD COLUMN IF NOT EXISTS version       INTEGER NOT NULL DEFAULT 1;
ALTER TABLE hr_documents ADD COLUMN IF NOT EXISTS parent_id     UUID REFERENCES hr_documents(id) ON DELETE SET NULL;
ALTER TABLE hr_documents ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'uploaded'
  CHECK (status IN ('uploaded', 'assigned', 'sent_for_signature', 'signed', 'archived', 'expired'));
ALTER TABLE hr_documents ADD COLUMN IF NOT EXISTS visibility    TEXT NOT NULL DEFAULT 'admin'
  CHECK (visibility IN ('employee', 'groupleader', 'admin'));
ALTER TABLE hr_documents ADD COLUMN IF NOT EXISTS valid_from    DATE;
ALTER TABLE hr_documents ADD COLUMN IF NOT EXISTS valid_to      DATE;
ALTER TABLE hr_documents ADD COLUMN IF NOT EXISTS description   TEXT;
ALTER TABLE hr_documents ADD COLUMN IF NOT EXISTS uploaded_by   UUID REFERENCES employees(id) ON DELETE SET NULL;

-- Erweitere Kategorie-CHECK
DO $$
DECLARE
  constraint_name_val TEXT;
BEGIN
  SELECT con.conname INTO constraint_name_val
  FROM pg_constraint con
  JOIN pg_attribute att ON att.attrelid = con.conrelid
    AND att.attnum = ANY(con.conkey)
  WHERE con.conrelid = 'hr_documents'::regclass
    AND att.attname = 'category'
    AND con.contype = 'c'
  LIMIT 1;

  IF constraint_name_val IS NOT NULL THEN
    EXECUTE format('ALTER TABLE hr_documents DROP CONSTRAINT %I', constraint_name_val);
  END IF;
END $$;

ALTER TABLE hr_documents ADD CONSTRAINT hr_documents_category_check
  CHECK (category IN (
    'contract', 'payslip', 'certificate', 'training', 'other',
    'warning', 'evaluation', 'id_document', 'health_certificate',
    'insurance', 'termination', 'onboarding'
  ));

CREATE INDEX IF NOT EXISTS idx_hr_documents_parent ON hr_documents (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hr_documents_status ON hr_documents (status);
CREATE INDEX IF NOT EXISTS idx_hr_documents_valid_to ON hr_documents (valid_to) WHERE valid_to IS NOT NULL;

-- 2. Digitale Signaturen
CREATE TABLE IF NOT EXISTS document_signatures (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id       UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  document_id       UUID NOT NULL REFERENCES hr_documents(id) ON DELETE CASCADE,
  signer_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  requested_by      UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at         TIMESTAMPTZ,
  signed_at         TIMESTAMPTZ,
  rejected_at       TIMESTAMPTZ,
  signature_data    JSONB,  -- { ip, user_agent, consent_text, timestamp }
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'opened', 'signed', 'rejected', 'expired')),
  expires_at        TIMESTAMPTZ,
  reminder_sent_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signatures_document ON document_signatures (document_id);
CREATE INDEX IF NOT EXISTS idx_signatures_signer ON document_signatures (signer_employee_id, status);
CREATE INDEX IF NOT EXISTS idx_signatures_practice ON document_signatures (practice_id, status);

ALTER TABLE document_signatures ENABLE ROW LEVEL SECURITY;

-- Signer sieht eigene, Admins sehen alle
DROP POLICY IF EXISTS signatures_select ON document_signatures;
CREATE POLICY signatures_select
  ON document_signatures FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = document_signatures.signer_employee_id
        AND e.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = document_signatures.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- Admins erstellen Signatur-Anfragen
DROP POLICY IF EXISTS signatures_insert ON document_signatures;
CREATE POLICY signatures_insert
  ON document_signatures FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = document_signatures.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- Signer oder Admin kann Status updaten
DROP POLICY IF EXISTS signatures_update ON document_signatures;
CREATE POLICY signatures_update
  ON document_signatures FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = document_signatures.signer_employee_id
        AND e.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = document_signatures.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = document_signatures.signer_employee_id
        AND e.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = document_signatures.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );
