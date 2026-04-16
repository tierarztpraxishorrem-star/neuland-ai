# Neuland AI – Projekt-Audit
Datum: 2026-04-16

## Zusammenfassung
Das Projekt ist funktional stabil und verfügt über eine solide Modul-Abdeckung (HR, Kommunikation, Konsultation, VetMind, Diamond). Die größte Stärke ist die konsequente Multi-Tenancy-Architektur mit RLS auf allen Tabellen. Die dringendsten Baustellen sind: (1) `lib/yeastarWebhookStore.ts` speichert Daten im Dateisystem statt in Supabase – alle Webhook-Daten gehen bei jedem Vercel-Deploy verloren; (2) 23 API-Routen fehlt ein try/catch-Block; (3) `app/kommunikation/page.tsx` und weitere Seiten nutzen Inline-Styles statt Tailwind, was das Design-System unterhöhlt.

---

## Fertige Module
| Modul | Pfad | Qualität | Anmerkung |
|-------|------|----------|-----------|
| Konsultation (Live, Record, Result) | /app/konsultation/ | ✅ Gut | Umfangreichste localStorage-Nutzung |
| Patienten | /app/patienten/ | ✅ Gut | localStorage für autosave, OK |
| Diamond Assessment | /app/diamant/, /lib/diamond/ | ✅ Gut | Profile in Supabase gespeichert |
| HR Zeiterfassung | /app/hr/, /app/hr/admin/ | ✅ Gut | Vollständig mit RLS |
| HR Urlaubsplaner | /app/hr/vacation/ | ✅ Gut | Gruppen, Entitlements, Kalender |
| HR Abwesenheiten | /app/hr/absences/ | ✅ Gut | |
| HR Dienstplan | /app/hr/schedule/ | ✅ Gut | |
| HR Dokumente | /app/hr/documents/ | ✅ Gut | |
| HR Onboarding | /app/hr/onboarding/ | ✅ Gut | |
| Kommunikation Hub | /app/kommunikation/ | ⚠️ Verbesserungsbedarf | 68 Inline-Styles statt Tailwind |
| WhatsApp Business | /app/kommunikation/whatsapp/ | ✅ Gut | Media via R2 |
| Slack Integration | /app/kommunikation/slack/ | ✅ Gut | |
| Yeastar Telefonanlage | /app/api/yeastar/ | 🔴 Problem | Webhook-Store nicht Vercel-kompatibel |
| VetMind KI-Assistent | /app/vetmind/ | ⚠️ Verbesserungsbedarf | Chat-Persistenz in Supabase ✅, aber Kontext noch in localStorage |
| Chatbot + Analytics | /app/api/chatbot/, /lib/chatbotAnalytics.ts | ⚠️ Verbesserungsbedarf | Insights brauchen Vercel Blob |
| Admin Dashboard | /app/admin/ | ⚠️ Verbesserungsbedarf | 3 API-Routen ohne try/catch |
| Templates | /app/vorlagen/ | ✅ Gut | |
| Auth + Onboarding | /app/onboarding/ | ✅ Gut | |
| File Storage (R2) | /lib/server/r2Upload.ts | ⚠️ Verbesserungsbedarf | R2-URL hardcodiert statt env var |

---

## Design-Konsistenz

### Probleme gefunden:
- **app/kommunikation/page.tsx** – 68 Inline-Styles (`style={{...}}`), keine Tailwind-Klassen. Komplette Abweichung vom Design-System. Farben, Abstände, Border-Radius alles inline definiert.
- **app/ (gesamt)** – 1.375 Inline-Style-Verwendungen projektübergreifend. Besonders auffällig in Kommunikation, aber auch in anderen Seiten vereinzelt.
- **app/hilfe/page.tsx, app/was-ist-neuland/page.tsx, app/legal/** – Statische Info-Seiten, visuell konsistent, aber nicht mit dem Sidebar-Layout integriert (kein `<Sidebar />`).
- **Doppelte Diamond-Komponenten**: `/app/diamant/page.tsx` und `/app/hr/diamant/page.tsx` könnten zusammengeführt werden – prüfen ob beide identische Logik haben.

### Empfehlung:
1. `app/kommunikation/page.tsx` Schritt für Schritt auf Tailwind-Klassen migrieren (Card-Styles zuerst: `bg-white rounded-xl border border-gray-200 shadow-sm`).
2. Globale Suche nach `style={{` und schrittweise Ersatz durch Tailwind. Priorität: Seiten die User täglich sehen (Kommunikation, HR, Konsultation).
3. Einheitliche Card-Klasse definieren (z.B. in `/components/ui/System.tsx`) und konsistent verwenden.

---

## Datenspeicherung

### Risiken gefunden:
- **lib/yeastarWebhookStore.ts (Zeilen 1, 37)** – `writeFile` schreibt Webhook-Events in `data/yeastar-webhook-events.json`. Auf Vercel (serverless) existiert kein persistentes Dateisystem. **Alle empfangenen Webhook-Events gehen bei jedem Deploy verloren.** Race-Conditions bei parallelen Requests möglich.
- **app/konsultation/[id]/result/page.tsx** – 20+ localStorage-Keys für Autosave (Transkripte, Befunde, Diagnosen, Patientenbriefe). Datenverlust wenn Browser-Cache geleert wird oder anderes Gerät genutzt wird.
- **app/vetmind/page.tsx** – VetMind-Kontext und Sessions in localStorage (inkl. `vetmind_context`, Gesprächsverläufe). Obwohl Supabase-Migration existiert, landet nicht alles dort.
- **app/patienten/[id]/page.tsx** – `patient_summary_${patientId}` in localStorage. Patientenzusammenfassungen sind sensitive Daten.
- **app/konsultation/[id]/live/page.tsx, /record/page.tsx** – Autosave von laufenden Aufnahmen in localStorage.
- **app/chat/page.tsx** – Consent-Tracking in localStorage (weniger kritisch, aber inkonsistent).
- **components/Sidebar.tsx, SidebarWrapper.tsx** – Sidebar-Collapse-Status in localStorage (akzeptabel für UI-State).
- **components/diamond/DiamondQuiz.tsx** – Quiz-Finalisierungs-Flag in localStorage (akzeptabel).

### Empfehlung:
1. **Sofort**: `lib/yeastarWebhookStore.ts` auf Supabase-Tabelle `yeastar_webhook_events` migrieren.
2. **Diese Woche**: Konsultations-Autosave (`result/page.tsx`) in Supabase-Tabelle `case_drafts` persistieren. localStorage nur als Cache behalten.
3. **Danach**: VetMind-Kontext vollständig in `vetmind_sessions`-Tabelle verschieben. localStorage nur für UI-State (Collapsed/Expanded) behalten.

---

## Modul-Zusammenarbeit

### Probleme gefunden:

**Fehlende try/catch (23 API-Routen):**
- `/api/title/route.ts` – OpenAI-Call ohne Error-Handling → 500er bei API-Fehler
- `/api/admin/users/route.ts`, `/api/admin/stats/route.ts`, `/api/admin/employees/route.ts` – Alle 3 Admin-Routen ungeschützt
- `/api/auth/consent/route.ts`, `/api/auth/registration-config/route.ts`
- `/api/fonio/route.ts` – Externe API-Calls ohne try/catch
- `/api/upload-url/route.ts`, `/api/upload/route.ts`
- `/api/yeastar/webhook/route.ts`, `/api/yeastar/route.ts`, `/api/yeastar/events/route.ts`, `/api/yeastar/recordings/route.ts`
- `/api/hr/start/route.ts`, `/api/hr/stop/route.ts`
- `/api/slack/route.ts`
- `/api/whatsapp/suggest/route.ts`, `/api/whatsapp/conversations/route.ts`, `/api/whatsapp/conversations/[id]/messages/route.ts`, `/api/whatsapp/media/route.ts`
- `/api/practices/search/route.ts`, `/api/practices/request-join/route.ts`
- `/api/debug/system-state/route.ts`

**Hardcodierte Werte:**
- `/api/upload-url/route.ts:27` und `/api/upload/route.ts:51` – R2-Bucket-URL `pub-14794881d3f446c2b026b4c2d9715c0a.r2.dev` hardcodiert. Sollte `process.env.R2_PUBLIC_URL` sein.

**Fire-and-Forget ohne Fehlerbehandlung:**
- `/api/yeastar/webhook/route.ts:80` – Interner `fetch()` zu `/api/yeastar/process-call` ohne `await`, nur `.catch()`. Kein Retry, kein Timeout, stille Fehler.

**Doppelte Migrations-Dateien:**
- 10 Migrations-Dateien existieren in zwei Formaten parallel (YYYYMMDD und YYYYMMDDHHMMSS). Beispiel: `20260406_patient_system.sql` und `20260406000000_patient_system.sql`. Wenn beide in Supabase eingespielt werden, gibt es Duplikat-Fehler.

**Verwaister Endpunkt:**
- `/api/slack/channels/[id]/messages/route.ts` – Existiert, aber Referenzierung unklar.

### Empfehlung (nach Dringlichkeit):
1. `lib/yeastarWebhookStore.ts` → Supabase-Tabelle (Datenverlust-Risiko)
2. R2-URL in `.env.local` als `R2_PUBLIC_URL` auslagern
3. Die 23 ungeschützten API-Routen mit standardisiertem try/catch wrappen
4. Doppelte Migrations-Dateien klären und älteres Format löschen
5. Yeastar webhook fire-and-forget auf `await` + Retry umstellen

---

## Verwaiste Dateien

| Datei | Status | Empfehlung |
|-------|--------|------------|
| `app/vetmind/page Kopie.tsx` | Vergessene Arbeitskopie, wird nicht genutzt | **Löschen** |
| `supabase/migrations/20260406_*.sql` (10 Dateien ohne Timestamp) | Duplikate der YYYYMMDDHHMMSS-Versionen | **Löschen** (nach Prüfung ob schon eingespielt) |
| `app/chat/page.tsx` | Chat-Seite existiert, aber kein Sidebar-Link sichtbar | Prüfen ob aktiv genutzt |
| `app/page Kopie.tsx` (gelöscht in Git, aber referenziert?) | In letzten 10 Commits gelöscht | OK – bereits bereinigt |

---

## Priorisierte To-Do-Liste

### 🔴 Sofort (Datenverlust-Risiko oder Fehler):
1. **`lib/yeastarWebhookStore.ts` → Supabase migrieren.** Alle Yeastar-Webhook-Events landen derzeit in einer lokalen JSON-Datei die auf Vercel bei jedem Deploy gelöscht wird. Migration: neue Tabelle `yeastar_webhook_events` anlegen, `appendYeastarWebhookEvent()` und `readYeastarWebhookEvents()` auf Supabase umstellen.
2. **Doppelte Migrations-Dateien bereinigen.** 10 Dateien existieren in zwei Formaten parallel – klären welches Format in Supabase eingespielt ist, das andere löschen um Konflikte bei künftigen Deployments zu vermeiden.
3. **`app/vetmind/page Kopie.tsx` löschen.** Verwaiste Arbeitskopie im Produktionscode.

### 🟡 Diese Woche (Design & Konsistenz):
1. **`app/kommunikation/page.tsx` auf Tailwind migrieren.** 68 Inline-Styles konsequent durch Tailwind-Klassen ersetzen. Höchste visuelle Priorität da täglich genutzt.
2. **R2-URL in env auslagern.** `pub-14794881d3f446c2b026b4c2d9715c0a.r2.dev` in beiden Upload-Routen durch `process.env.NEXT_PUBLIC_R2_URL` ersetzen.
3. **Kritische API-Routen mit try/catch schützen.** Mindestens: `/api/title`, `/api/admin/*`, `/api/hr/start`, `/api/hr/stop`, `/api/whatsapp/*`.

### 🟢 Danach (Verbesserungen & neue Features):
1. **Konsultations-Autosave in Supabase persistieren.** `result/page.tsx` speichert 20+ Felder in localStorage. Eine `case_drafts`-Tabelle würde Datenverlust bei Browser-Cache-Löschung verhindern.
2. **VetMind-Kontext vollständig in Supabase.** `vetmind_context` in localStorage → `vetmind_sessions`-Tabelle.
3. **Yeastar webhook `await` + Retry.** Fire-and-forget auf `/api/yeastar/process-call` durch awaited Call mit Retry-Logik ersetzen.
4. **Restliche 20 API-Routen mit try/catch wrappen.**
5. **`app/chat/page.tsx` klären** – Ist die Route aktiv? Wenn ja, Sidebar-Link ergänzen. Wenn nein, löschen.

---

## Technische Schulden

- **Inline-Styles projektübergreifend (1.375 Vorkommen)**: Funktioniert, aber erschwert Themes/Dark-Mode und ist inkonsistent mit Tailwind-First-Ansatz.
- **localStorage als primärer Datenspeicher für Konsultationsdaten**: Für Einzelgerät-Nutzung OK, aber kein Geräteübergreifendes Arbeiten möglich.
- **Keine zentralisierte OpenAI-Client-Instanz**: Jede API-Route erstellt eigene `fetch()`-Calls mit eigenem Auth-Header. Ein zentraler `openai`-Client aus dem `openai`-Package würde Wiederholung reduzieren.
- **Kein zentrales Error-Handling-Middleware**: Jede Route implementiert (oder vergisst) try/catch individuell. Ein `withErrorHandling()`-Wrapper würde das standardisieren.
- **`features.ts` Feature-Flags**: Statische Konfiguration, kein dynamisches Toggle-System. Für die aktuelle Größe OK, bei mehr Features prüfen ob LaunchDarkly/GrowthBook sinnvoll.
- **Migrations-Namensformat-Mischung**: YYYYMMDD vs. YYYYMMDDHHMMSS – einheitlich auf YYYYMMDDHHMMSS festlegen.
