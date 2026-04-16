-- Microsoft-Graph Change-Notifications für Mail-Push (statt Polling).
-- 1. mail_subscriptions: eine Zeile pro aktive Subscription bei Graph.
-- 2. mail_notifications: Fanout-Tabelle, über die Client-Realtime läuft.

CREATE TABLE IF NOT EXISTS mail_subscriptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  TEXT NOT NULL UNIQUE,    -- ID, die Graph zurückgibt
  resource         TEXT NOT NULL,           -- z.B. users/empfang@.../mailFolders/inbox/messages
  change_types     TEXT NOT NULL DEFAULT 'created,updated',
  client_state     TEXT NOT NULL,           -- Shared Secret für Notification-Validation
  expires_at       TIMESTAMPTZ NOT NULL,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_subscriptions_expires ON mail_subscriptions (expires_at);

ALTER TABLE mail_subscriptions ENABLE ROW LEVEL SECURITY;

-- Nur Admins lesen/schreiben – Praxis-neutral, da geteiltes Postfach
DROP POLICY IF EXISTS mail_subscriptions_admin_rw ON mail_subscriptions;
CREATE POLICY mail_subscriptions_admin_rw
  ON mail_subscriptions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- Notifications: ein Event pro neuer/aktualisierter Mail, mit TTL (per Cron aufräumen)
CREATE TABLE IF NOT EXISTS mail_notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   TEXT NOT NULL,
  change_type  TEXT NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_notifications_occurred ON mail_notifications (occurred_at DESC);

ALTER TABLE mail_notifications ENABLE ROW LEVEL SECURITY;

-- Alle authentifizierten User dürfen lesen (für Realtime)
DROP POLICY IF EXISTS mail_notifications_read_all ON mail_notifications;
CREATE POLICY mail_notifications_read_all
  ON mail_notifications FOR SELECT TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS trg_mail_subscriptions_updated_at ON mail_subscriptions;
CREATE TRIGGER trg_mail_subscriptions_updated_at
BEFORE UPDATE ON mail_subscriptions
FOR EACH ROW
EXECUTE FUNCTION set_practice_settings_updated_at();

-- Realtime für mail_notifications aktivieren (Supabase Realtime Publication)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mail_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mail_notifications;
  END IF;
END $$;
