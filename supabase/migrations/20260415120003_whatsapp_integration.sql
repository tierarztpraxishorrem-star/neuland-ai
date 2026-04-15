-- WhatsApp Business Integration
-- Tables: whatsapp_contacts, whatsapp_conversations, whatsapp_messages

-- Contacts (phone numbers linked to practice)
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  wa_id TEXT NOT NULL,            -- WhatsApp ID (phone with country code, e.g. 4917612345678)
  phone TEXT NOT NULL,            -- Display phone (+49 176 12345678)
  display_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(practice_id, wa_id)
);

-- Conversations (one per contact, re-opened on new message)
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','waiting','resolved','closed')),
  assigned_to UUID REFERENCES employees(id),  -- employee responsible
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_conv_practice_status ON whatsapp_conversations(practice_id, status);
CREATE INDEX idx_wa_conv_contact ON whatsapp_conversations(contact_id);

-- Messages
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  wa_message_id TEXT,             -- Meta message ID for dedup
  body TEXT,
  media_url TEXT,
  media_type TEXT,                -- image, document, audio, video
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','sent','delivered','read','failed')),
  sent_by_employee_id UUID REFERENCES employees(id),      -- who actually sent it
  ai_suggested BOOLEAN NOT NULL DEFAULT false,
  ai_suggestion_original TEXT,   -- the AI draft before edits
  error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(wa_message_id)
);

CREATE INDEX idx_wa_msg_conv ON whatsapp_messages(conversation_id, created_at);
CREATE INDEX idx_wa_msg_practice ON whatsapp_messages(practice_id);

-- RLS
ALTER TABLE whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY wa_contacts_practice ON whatsapp_contacts
  FOR ALL USING (
    practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY wa_conversations_practice ON whatsapp_conversations
  FOR ALL USING (
    practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY wa_messages_practice ON whatsapp_messages
  FOR ALL USING (
    practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid())
  );

-- Service role full access
CREATE POLICY wa_contacts_service ON whatsapp_contacts
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY wa_conversations_service ON whatsapp_conversations
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY wa_messages_service ON whatsapp_messages
  FOR ALL USING (true) WITH CHECK (true);
