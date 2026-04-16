# Neuland AI – Projektgedächtnis

## Projekt
Veterinärpraxis-Software für TZN Bergheim.
Stack: Next.js App Router, Supabase, Vercel, TypeScript, Tailwind CSS.
Deployment: Vercel via GitHub.

## Ordnerstruktur
- /app                    → Seiten (Next.js App Router)
- /app/api                → API Routes
- /lib                    → supabase.ts, toast.ts, features.ts, etc.
- /lib/server             → Server-only Utilities (supabase, whatsapp, slack, r2Upload, hrUtils, getUserPractice)
- /lib/hr                 → HR Hilfsfunktionen (permissions.ts, workdays.ts)
- /lib/diamond            → Diamond-Modul Logik (types, questions, scoring)
- /components             → React Komponenten
- /supabase/migrations    → SQL Migrations (Format: YYYYMMDDHHMMSS_name.sql)

## Auth-Regel (IMMER einhalten)
fetchWithAuth() aus lib/supabase.ts für alle API-Calls verwenden.
Supabase-Client in API-Routes mit User-JWT initialisieren → RLS greift automatisch.
Niemals fetch() ohne Auth-Header für geschützte Routen.

## Datenbank-Regeln
- Migrations als .sql in /supabase/migrations/
- Dateiname-Format: YYYYMMDDHHMMSS_beschreibung.sql
- CREATE TABLE immer mit IF NOT EXISTS
- PRIMARY KEY: UUID DEFAULT gen_random_uuid()
- Timestamps: TIMESTAMPTZ NOT NULL DEFAULT now()
- RLS bei jeder neuen Tabelle aktivieren

## Sprache
UI-Texte + API-Fehlermeldungen: Deutsch
Variablennamen + Kommentare: Englisch

## Fehlerbehandlung (IMMER)
try/catch in allen API-Routen.
Fehler auf Deutsch zurückgeben.
Analytics-Fehler dürfen nie den Chat-Response blockieren.

## Bereits gebaute Module

### Konsultation
- Live-Aufnahme, Ergebnis, Patientenbrief, letzte Konsultation
- Pfad: /app/konsultation/
- API: /app/api/anamnesis/live/, /app/api/transcribe/, /app/api/analyze-image/

### Patienten
- Patientenliste + Detailansicht
- Pfad: /app/patienten/

### Diamond Assessment
- Persönlichkeits-Assessment mit Quiz, Scoring, Chart-Visualisierung
- Profile werden in Supabase gespeichert
- Pfad: /app/diamant/, /lib/diamond/
- Migration: 20260413120000_personal_diamond_profiles.sql

### HR Modul (vollständig)
- Zeiterfassung:   /app/hr/ + /app/hr/admin/
- Urlaubsplaner:   /app/hr/vacation/ (Gruppen, Entitlements, Kalender)
- Abwesenheiten:   /app/hr/absences/
- Dienstplan:      /app/hr/schedule/
- Dokumente:       /app/hr/documents/
- Onboarding:      /app/hr/onboarding/
- API-Routen:      /app/api/hr/ (start, stop, absences, shifts, documents, onboarding, vacation, vacation/groups)
- Permissions:     /lib/hr/permissions.ts (Rollen: employee, group_admin, admin)
- Migrations:      20260415_hr_module.sql, 20260415120001_hr_absences_shifts_docs_onboarding.sql, 20260415120002_vacation_planner.sql

### Kommunikation Hub
- Übersicht mit unread-Badge: /app/kommunikation/
- WhatsApp Business: Konversationsliste + Detailansicht, Media via R2
  - UI: /app/kommunikation/whatsapp/
  - API: /app/api/whatsapp/ (webhook, send, conversations, media, suggest)
  - Lib: /lib/server/whatsapp.ts
  - Migration: 20260415120003_whatsapp_integration.sql, 20260415120004_whatsapp_media.sql
- Slack: Kanalliste + Detailansicht
  - UI: /app/kommunikation/slack/
  - API: /app/api/slack/ (route, channels, send)
  - Lib: /lib/server/slack.ts

### Yeastar Telefonanlage
- Webhook-Empfang, Call Recordings, Auto-Record-Konfiguration
- API: /app/api/yeastar/
- Lib: /lib/yeastarApi.ts, /lib/yeastarWebhookStore.ts
- Migration: 20260415200000_call_recordings.sql

### Vetmind
- KI-gestützter Veterinär-Assistent mit Chat-Persistenz
- Pfad: /app/vetmind/
- Migration: 20260415210000_vetmind_chat_persistence.sql

### Chatbot + Analytics
- Chatbot: /app/api/chatbot/
- Analytics: /lib/chatbotAnalytics.ts
- Insights: /app/hr/admin/insights (Vercel Blob für Storage nötig!)

### Admin Dashboard
- Statistiken, User-Management, Employee-Management
- Pfad: /app/admin/
- API: /app/api/admin/ (stats, users, employees)

### Auth + Onboarding
- Registration, Consent, Privacy Config
- Pfad: /app/onboarding/, /app/api/auth/
- Migration: 20260412130000_registration_settings_and_consents.sql

### Templates
- Praxis- und System-Templates mit KI-Unterstützung
- Pfad: /app/vorlagen/, /app/api/templates/

### File Storage
- Cloudflare R2 für Medien/Uploads
- Lib: /lib/server/r2Upload.ts

## Multitenancy
- Jede Praxis (practice) ist mandantenfähig isoliert
- RLS-Policies auf allen Tabellen
- Migrations: 20260407_multitenancy_foundation.sql

## Modell-Wahl
Sonnet → Alltag: Code schreiben, Migrations, Bugs fixen
Opus   → Architektur, komplexe neue Features planen

## So wird CLAUDE.md aktuell gehalten
Wenn ein Modul fertig gebaut ist, sagt der Nutzer:
"Aktualisiere CLAUDE.md – [Modulname] ist fertig."
→ Modul unter "Bereits gebaute Module" eintragen oder ergänzen.
