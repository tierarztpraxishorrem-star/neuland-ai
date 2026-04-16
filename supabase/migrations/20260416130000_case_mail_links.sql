-- Verknüpft Microsoft-Graph-Mails mit Fällen (cases).
-- Mail-Inhalt bleibt bei Graph, hier cachen wir nur die Metadaten für schnelle Anzeige.

CREATE TABLE IF NOT EXISTS case_mail_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  message_id      TEXT NOT NULL,
  conversation_id TEXT,
  subject         TEXT,
  from_name       TEXT,
  from_address    TEXT,
  received_at     TIMESTAMPTZ,
  linked_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  linked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT case_mail_links_unique UNIQUE (case_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_case_mail_links_case ON case_mail_links (case_id);
CREATE INDEX IF NOT EXISTS idx_case_mail_links_message ON case_mail_links (message_id);
CREATE INDEX IF NOT EXISTS idx_case_mail_links_practice ON case_mail_links (practice_id);
CREATE INDEX IF NOT EXISTS idx_case_mail_links_conversation ON case_mail_links (conversation_id) WHERE conversation_id IS NOT NULL;

ALTER TABLE case_mail_links ENABLE ROW LEVEL SECURITY;

-- Praxis-Mitglieder sehen Links ihrer Praxis
DROP POLICY IF EXISTS case_mail_links_select ON case_mail_links;
CREATE POLICY case_mail_links_select
  ON case_mail_links FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = case_mail_links.practice_id
        AND pm.user_id = auth.uid()
    )
  );

-- Praxis-Mitglieder können verknüpfen
DROP POLICY IF EXISTS case_mail_links_insert ON case_mail_links;
CREATE POLICY case_mail_links_insert
  ON case_mail_links FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = case_mail_links.practice_id
        AND pm.user_id = auth.uid()
    )
  );

-- Praxis-Mitglieder können Links löschen
DROP POLICY IF EXISTS case_mail_links_delete ON case_mail_links;
CREATE POLICY case_mail_links_delete
  ON case_mail_links FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = case_mail_links.practice_id
        AND pm.user_id = auth.uid()
    )
  );
