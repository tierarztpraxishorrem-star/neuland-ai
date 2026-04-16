Erstelle eine neue Supabase-Migration.

Dateiname: /supabase/migrations/$CURRENT_DATE_$ARGUMENTS.sql
Format: YYYYMMDD_beschreibung.sql

Regeln:
- CREATE TABLE immer mit IF NOT EXISTS
- PRIMARY KEY: UUID DEFAULT gen_random_uuid()
- Timestamps: TIMESTAMPTZ NOT NULL DEFAULT now()
- RLS aktivieren: ALTER TABLE x ENABLE ROW LEVEL SECURITY
- Passende Indexes anlegen
- Am Ende: Kurzer Kommentar was diese Migration macht
