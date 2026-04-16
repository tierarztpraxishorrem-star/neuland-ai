# Neuland AI – Projektgedächtnis

## Projekt
Veterinärpraxis-Software für TZN Bergheim.
Stack: Next.js 16, React 19, Supabase, Vercel, TypeScript, Tailwind CSS v4.
Deployment: Vercel via GitHub.
KI: OpenAI Responses API (`/v1/responses`, Modell `gpt-4.1-mini`), AssemblyAI (Transkription), OpenAI Whisper
Storage: Supabase DB + RLS, Cloudflare R2 (Medien/Uploads), Vercel Blob (Insights)
Monitoring: Sentry (`@sentry/nextjs`)

## Ordnerstruktur
- /app                    → Seiten (Next.js App Router)
- /app/api                → API Routes
- /lib                    → Client-seitige Utilities
- /lib/server             → Server-only Utilities (getUserPractice, hrUtils, r2Upload, slack, whatsapp)
- /lib/hr                 → HR-Hilfsfunktionen (permissions.ts, workdays.ts)
- /lib/diamond            → Diamond-Modul Logik (types.ts, questions.ts, scoring.ts)
- /components             → React Komponenten
- /supabase/migrations    → SQL Migrations (Format: YYYYMMDDHHMMSS_name.sql)

## Wichtige lib/-Dateien
| Datei | Zweck |
|-------|-------|
| lib/supabase.ts | Supabase-Client + fetchWithAuth() Helper |
| lib/toast.ts | Toast-Benachrichtigungen |
| lib/features.ts | Feature-Flags |
| lib/liveAnamnesis.ts | Live-Anamnese Hilfsfunktionen |
| lib/pdfReport.ts | PDF-Report-Generierung (jsPDF) |
| lib/yeastarApi.ts | Yeastar Telefonanlage API-Wrapper |
| lib/yeastarWebhookStore.ts | ⚠️ Datei-basierter Webhook-Store (nicht persistent auf Vercel!) |
| lib/chatbotAnalytics.ts | Chatbot-Nutzungsanalyse |
| lib/ownerCommunicationTemplate.ts | Tierbesitzer-Kommunikationsvorlagen |
| lib/patientBreeds.ts | Tierrassen-Daten |
| lib/registrationConfig.ts | Registrierungsformular-Konfiguration |
| lib/privacyConfig.ts | Datenschutz/Consent-Konfiguration |
| lib/server/getUserPractice.ts | Praxis-Zugehörigkeit + Auth-Helper |
| lib/server/hrUtils.ts | HR-Modul Utilities |
| lib/server/r2Upload.ts | Cloudflare R2 Upload-Helper |
| lib/server/slack.ts | Slack API Integration |
| lib/server/whatsapp.ts | WhatsApp Business API Integration |

## Datenbank-Tabellen (Supabase)
Alle Tabellen haben RLS aktiviert und UUID-Primary-Keys.

| Tabelle | Migration | Beschreibung |
|---------|-----------|--------------|
| patients, cases, case_members | 20260406000000 | Kern-Patientensystem |
| practice_settings | 20260406120001 | Praxis-Einstellungen |
| templates | 20260406120002-04 | Interne + Patienten-Templates |
| practice_memberships | 20260407120006 | Multi-Tenancy Grundlage |
| registration_settings, consents | 20260412130000 | Registrierung + Consent |
| diamond_profiles, diamond_results | 20260413+14 | Diamond Assessment |
| employee_groups, employee_group_members | 20260415120001 | HR-Gruppen |
| absences, vacation_entitlements | 20260415120002 | Urlaubsplaner |
| whatsapp_conversations, whatsapp_messages | 20260415120003 | WhatsApp Integration |
| whatsapp_media | 20260415120004 | WhatsApp Medien (R2) |
| call_recordings | 20260415200000 | Yeastar Anruf-Aufnahmen |
| vetmind_sessions, vetmind_messages | 20260415210000 | VetMind Chat-Persistenz |
| public_holidays, shifts, hr_documents, onboarding_tasks | 20260415120001 | HR Kern-Tabellen |
| yeastar_webhook_events | 20260416000001 | Yeastar Webhook-Events (war: Datei-basiert, jetzt Supabase) |
| case_drafts | 20260416000002 | Konsultations-Autosave (geräteübergreifend, ergänzt localStorage) |

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
- E-Mail (Microsoft Graph): Posteingang lesen, versenden, antworten, KI-Entwurf
  - UI: /app/kommunikation/mail/ (Liste + Detail mit Reply & AI-Draft)
  - API: /app/api/mail/ (messages GET, [id] GET/PATCH, [id]/reply POST, [id]/attachments/[aid] GET, send POST, draft-ai POST)
  - Lib: /lib/server/mail.ts
  - Auch in Vetmind: aufklappbare Sektion "E-Mail Posteingang" mit KI-Entwurf im Chat

### Microsoft Graph Integration
- Geteilter Client für SharePoint + Mail (Client-Credentials-Flow, Token-Cache 55min)
- Lib: /lib/server/msGraph.ts (getAccessToken, graphFetch, graphJson, MsGraphError)
- Konsumenten: /lib/server/sharepoint.ts, /lib/server/mail.ts
- SharePoint: Suche (Query-Splitting + Parallel-Requests), Folder, Read (docx/pdf/xlsx), Create, Update
  - UI: Vetmind-Sektion "SharePoint" unterhalb TTS
  - API: /app/api/sharepoint/ (search, files, files/[itemId], site, setup)
- Setup-Check: /api/sharepoint/setup (admin-only Diagnose: env + Token + Site)
- Azure App-Permissions: Sites.Read.All, Sites.ReadWrite.All, Files.ReadWrite.All, Sites.Search.All, Mail.Read, Mail.Send
- Env vars: MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET,
  MICROSOFT_SHAREPOINT_SITE_ID (optional), MICROSOFT_MAILBOX_EMAIL (geteiltes Postfach),
  MICROSOFT_GRAPH_REGION (default DEU)

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
