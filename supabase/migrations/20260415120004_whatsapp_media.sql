-- WhatsApp Media / Image Attachments
-- Stores downloaded media files with AI analysis and optional patient assignment

CREATE TABLE IF NOT EXISTS whatsapp_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES whatsapp_messages(id) ON DELETE CASCADE,
  practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,                         -- image, video, audio, document
  mime_type TEXT,                                    -- image/jpeg, image/png etc.
  file_size INT,
  storage_url TEXT,                                  -- R2 public URL
  storage_key TEXT,                                  -- R2 object key
  thumbnail_url TEXT,                                -- optional smaller version
  ai_analysis TEXT,                                  -- GPT-4o vision analysis
  ai_animal_type TEXT,                               -- detected animal type
  ai_body_part TEXT,                                 -- detected body part/area
  ai_condition TEXT,                                 -- detected condition/finding
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,  -- assigned patient
  assigned_by UUID REFERENCES employees(id),         -- who assigned it
  assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_media_message ON whatsapp_media(message_id);
CREATE INDEX idx_wa_media_conversation ON whatsapp_media(conversation_id);
CREATE INDEX idx_wa_media_patient ON whatsapp_media(patient_id);
CREATE INDEX idx_wa_media_practice ON whatsapp_media(practice_id);

-- Also add media_url back-reference to whatsapp_messages if not set
-- (media_url column already exists from previous migration)

-- RLS
ALTER TABLE whatsapp_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY wa_media_practice ON whatsapp_media
  FOR ALL USING (
    practice_id IN (SELECT practice_id FROM practice_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY wa_media_service ON whatsapp_media
  FOR ALL USING (true) WITH CHECK (true);
