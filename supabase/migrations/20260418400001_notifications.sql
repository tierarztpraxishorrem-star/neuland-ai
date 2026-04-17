-- ============================================================
-- Phase 4: HR Benachrichtigungen & Audit-Log Sicherung
-- ============================================================

-- 1. Benachrichtigungstabelle
CREATE TABLE IF NOT EXISTS hr_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  link            TEXT,
  is_read         BOOLEAN NOT NULL DEFAULT false,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_notifications_recipient
  ON hr_notifications (recipient_user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_notifications_practice
  ON hr_notifications (practice_id, created_at DESC);

ALTER TABLE hr_notifications ENABLE ROW LEVEL SECURITY;

-- Jeder sieht nur eigene
DROP POLICY IF EXISTS hr_notifications_select ON hr_notifications;
CREATE POLICY hr_notifications_select
  ON hr_notifications FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

-- System (via RPC/Trigger) erstellt Notifications
DROP POLICY IF EXISTS hr_notifications_insert ON hr_notifications;
CREATE POLICY hr_notifications_insert
  ON hr_notifications FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = hr_notifications.practice_id
        AND pm.user_id = auth.uid()
    )
  );

-- Mitarbeiter kann eigene als gelesen markieren
DROP POLICY IF EXISTS hr_notifications_update ON hr_notifications;
CREATE POLICY hr_notifications_update
  ON hr_notifications FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

-- 2. Sicherstellen dass hr_audit_log existiert
CREATE TABLE IF NOT EXISTS hr_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  actor_user_id UUID,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_audit_log_practice
  ON hr_audit_log (practice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_audit_log_entity
  ON hr_audit_log (entity_type, entity_id);

ALTER TABLE hr_audit_log ENABLE ROW LEVEL SECURITY;

-- Nur Admins dürfen Audit-Log lesen
DROP POLICY IF EXISTS hr_audit_log_select ON hr_audit_log;
CREATE POLICY hr_audit_log_select
  ON hr_audit_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = hr_audit_log.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- Alle authentifizierten Benutzer (für Trigger/RPC)
DROP POLICY IF EXISTS hr_audit_log_insert ON hr_audit_log;
CREATE POLICY hr_audit_log_insert
  ON hr_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- 3. Helper: Benachrichtigung erstellen
CREATE OR REPLACE FUNCTION notify_hr_event(
  p_practice_id UUID,
  p_recipient_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO hr_notifications (practice_id, recipient_user_id, type, title, body, link, metadata)
  VALUES (p_practice_id, p_recipient_user_id, p_type, p_title, p_body, p_link, p_metadata)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
