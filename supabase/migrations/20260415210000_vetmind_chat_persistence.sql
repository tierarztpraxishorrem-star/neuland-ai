-- VetMind: Persistente Chat-Sessions und Messages in Supabase
-- Ersetzt localStorage-basierte Speicherung durch DB-Persistenz

-- ───────────────────────────────────────
-- 1. vetmind_sessions
-- ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS vetmind_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  practice_id   uuid,
  title         text NOT NULL DEFAULT 'Neuer Chat',
  chat_patient  jsonb,
  chat_patient_consultations jsonb DEFAULT '[]'::jsonb,
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vetmind_sessions_user ON vetmind_sessions(user_id);
CREATE INDEX idx_vetmind_sessions_practice ON vetmind_sessions(practice_id);
CREATE INDEX idx_vetmind_sessions_last_opened ON vetmind_sessions(last_opened_at DESC);

-- ───────────────────────────────────────
-- 2. vetmind_messages
-- ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS vetmind_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES vetmind_sessions(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vetmind_messages_session ON vetmind_messages(session_id);
CREATE INDEX idx_vetmind_messages_created ON vetmind_messages(session_id, created_at ASC);

-- ───────────────────────────────────────
-- 3. RLS: Jeder sieht nur seine eigenen Chats
-- ───────────────────────────────────────
ALTER TABLE vetmind_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vetmind_messages ENABLE ROW LEVEL SECURITY;

-- Sessions: Owner-only
CREATE POLICY vetmind_sessions_select ON vetmind_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY vetmind_sessions_insert ON vetmind_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY vetmind_sessions_update ON vetmind_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY vetmind_sessions_delete ON vetmind_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Messages: über Session-Owner
CREATE POLICY vetmind_messages_select ON vetmind_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM vetmind_sessions WHERE id = vetmind_messages.session_id AND user_id = auth.uid())
  );

CREATE POLICY vetmind_messages_insert ON vetmind_messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM vetmind_sessions WHERE id = vetmind_messages.session_id AND user_id = auth.uid())
  );

CREATE POLICY vetmind_messages_update ON vetmind_messages
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM vetmind_sessions WHERE id = vetmind_messages.session_id AND user_id = auth.uid())
  );

CREATE POLICY vetmind_messages_delete ON vetmind_messages
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM vetmind_sessions WHERE id = vetmind_messages.session_id AND user_id = auth.uid())
  );
