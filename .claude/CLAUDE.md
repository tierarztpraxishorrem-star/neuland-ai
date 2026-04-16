# Neuland AI – Projektgedächtnis

## Projekt
Veterinärpraxis-Software für TZN Bergheim.
Stack: Next.js App Router, Supabase, Vercel, TypeScript, Tailwind CSS.
Deployment: Vercel via GitHub.

## Ordnerstruktur
- /app                    → Seiten (Next.js App Router)
- /app/api                → API Routes
- /lib                    → supabase.ts, toast.ts, chatbotAnalytics.ts
- /components             → React Komponenten
- /supabase/migrations    → SQL Migrations (Format: YYYYMMDD_name.sql)

## Auth-Regel (IMMER einhalten)
fetchWithAuth() aus lib/supabase.ts für alle API-Calls verwenden.
Supabase-Client in API-Routes mit User-JWT initialisieren → RLS greift automatisch.
Niemals fetch() ohne Auth-Header für geschützte Routen.

## Datenbank-Regeln
- Migrations als .sql in /supabase/migrations/
- Dateiname-Format: YYYYMMDD_beschreibung.sql
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
- HR Zeiterfassung:     /app/hr/ + /app/hr/admin/
- Chatbot + Analytics: /app/api/chatbot/
- Chatbot Insights:    /app/hr/admin/insights (Vercel Blob für Storage nötig!)

## In Entwicklung: HR Urlaubsplaner
Benötigte neue Tabellen:
  - employee_groups (id, name, color, min_coverage)
  - employee_group_members (employee_id, group_id, role: member|group_admin)
  - absences (id, employee_id, type, starts_on, ends_on, status, reviewed_by)
  - vacation_entitlements (employee_id, year, days_total, days_carry)
  - public_holidays (date, name) – NRW-Feiertage vorausfüllen

Rollen-System:
  - employee    → eigenen Urlaub beantragen, Kalender lesen
  - group_admin → Urlaub in eigener Gruppe genehmigen (pro Gruppe vergeben)
  - admin       → alles, Rollen vergeben

Vollständiger Bauplan: siehe urlaubsplaner-komplett.md im Projekt

## Modell-Wahl
Sonnet → Alltag: Code schreiben, Migrations, Bugs fixen
Opus   → Architektur, komplexe neue Features planen

## So wird CLAUDE.md aktuell gehalten
Wenn ein Modul fertig gebaut ist, sagt der Nutzer:
"Aktualisiere CLAUDE.md – [Modulname] ist fertig."
→ Modul von "In Entwicklung" nach "Bereits gebaut" verschieben und kurz beschreiben.
