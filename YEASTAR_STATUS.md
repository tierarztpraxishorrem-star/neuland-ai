# Yeastar-Integration – Ehrliche Statusübersicht

*Stand: 2026-04-16 · Basis: Code-Review von `app/api/yeastar/`, `lib/yeastarApi.ts`, `lib/yeastarWebhookStore.ts`, Migrations `20260415200000_call_recordings.sql` + `20260416000001_yeastar_webhook_events.sql` und `app/kommunikation/page.tsx`.*

## Kurzfassung

Das **Gerüst** für automatische Anruf-Zusammenfassungen steht: Webhook-Empfang, Recording-Tabelle, Transkriptions- und Summary-Pipeline, UI zum Anzeigen. **Die Kette reißt aber an zwei Stellen hart ab**, sodass aktuell kein einziger Anruf erfolgreich bis zur Zusammenfassung durchläuft. Dazu kommen mehrere Zuverlässigkeits- und Sicherheitslücken, die vor dem Produktivbetrieb geschlossen werden müssen.

---

## Was bereits funktioniert

### Webhook-Empfang
- [app/api/yeastar/webhook/route.ts](app/api/yeastar/webhook/route.ts) akzeptiert POST, validiert optional `YEASTAR_WEBHOOK_SECRET` (Header / Bearer / Query / Body), normalisiert Payload und legt Event in `yeastar_webhook_events` ab.
- Event-Typ-Weiche für `30012` / `CallEndDetails` / `call_end` ist vorhanden.
- GET liefert Health-Check-Response.

### Persistenz
- [supabase/migrations/20260415200000_call_recordings.sql](supabase/migrations/20260415200000_call_recordings.sql) definiert `call_recordings` mit vollem Status-Lifecycle (`pending → downloading → transcribing → summarizing → done | failed`), Indizes und RLS-Policies inkl. Service-Role-Bypass.
- [supabase/migrations/20260416000001_yeastar_webhook_events.sql](supabase/migrations/20260416000001_yeastar_webhook_events.sql) ersetzt den früheren Datei-Store durch Supabase.

### OAuth-Token-Management
- [lib/yeastarApi.ts:13-54](lib/yeastarApi.ts#L13-L54) holt Token via `get_token`, cached in-memory 30 Min mit 2-Min-Puffer, refresht per `refresh_token` bevor neu authentifiziert wird. Fallback auf `YEASTAR_ACCESS_TOKEN` aus Env ist drin.

### Transkriptions- & Summary-Pipeline (Struktur)
- [app/api/yeastar/process-call/route.ts](app/api/yeastar/process-call/route.ts) implementiert sauber:
  1. Recording-Download
  2. OpenAI Whisper (`gpt-4o-mini-transcribe`) mit AssemblyAI-Fallback
  3. GPT-4o-Summary mit veterinär-spezifischem System-Prompt (Anliegen / Details / Vereinbarung / Handlungsbedarf)
  4. Status-Updates auf jedem Schritt, failed-Pfade mit `error_message`.

### UI
- [app/kommunikation/page.tsx:324-698](app/kommunikation/page.tsx#L324-L698) zeigt Recordings mit Status-Badges, Summary-Preview und ausklappbarem Transkript. Webhook-Setup-Hinweis mit generierter URL ist sichtbar.

### Auto-Record-Schalter
- [app/api/yeastar/autorecord/route.ts](app/api/yeastar/autorecord/route.ts) kann Yeastar-Auto-Recording für inbound/outbound togglen.

---

## Was fehlt / kaputt ist

### 🔴 Blocker (Pipeline läuft ohne Fix **nicht durch**)

#### 1. `practice_id` fehlt beim INSERT – jeder Webhook schlägt fehl
[app/api/yeastar/webhook/route.ts:60-71](app/api/yeastar/webhook/route.ts#L60-L71) schreibt in `call_recordings` ohne `practice_id`. Die Spalte ist in der Migration `NOT NULL REFERENCES practices(id)` ([supabase/migrations/20260415200000_call_recordings.sql:4](supabase/migrations/20260415200000_call_recordings.sql#L4)) → DB-Insert wirft Constraint-Violation, Row wird nie angelegt, `process-call` nie getriggert.
**Fix:** Praxis-Auflösung aus dem Event ableiten. Webhook kennt den Tenant nicht – Optionen:
- Eine Praxis-ID in der Webhook-URL als Query-Param oder pro-Praxis-Secret führen (bei TZN Bergheim aktuell nur eine Praxis → harter Default-Env-Wert `YEASTAR_DEFAULT_PRACTICE_ID` als pragmatische Zwischenlösung).
- Langfristig: `yeastar_extension → practice_id`-Mapping-Tabelle, Auflösung über `callto`/`callfrom`.

#### 2. `downloadRecording` sendet Body auf GET – Yeastar antwortet nie mit URL
[lib/yeastarApi.ts:103-115](lib/yeastarApi.ts#L103-L115) ruft `yeastarRequest('GET', 'recording/download', { id })` auf. `yeastarRequest` hängt den Body auch bei GET an ([lib/yeastarApi.ts:90](lib/yeastarApi.ts#L90)), was HTTP-seitig bzw. seitens der Yeastar-API ignoriert wird. Yeastar Openapi `recording/download` erwartet `id` als Query-Parameter.
**Fix:** `id` an die URL anhängen (`recording/download?id=...`) statt als Body. Außerdem prüfen, ob `recording_id` aus Event `30012` direkt die Download-ID ist oder erst per `recording/search` aufgelöst werden muss – die Dokumentation unterscheidet hier.

### 🟠 Zuverlässigkeit

#### 3. Fire-and-forget-Fetch auf Vercel ist nicht zuverlässig
[app/api/yeastar/webhook/route.ts:80-86](app/api/yeastar/webhook/route.ts#L80-L86) feuert `fetch('/api/yeastar/process-call')` ohne `await`. Auf Vercel Serverless wird die Function nach dem Return beendet, offene Requests können abgebrochen werden.
**Fix:** Entweder `await` (mit Risiko Webhook-Timeout bei langer Pipeline) oder – sauber – Vercel-Cron oder Supabase-Queue / Edge-Function zum Abarbeiten pendings. Passt auch zu Punkt 4.

#### 4. Kein Retry / kein Stuck-Recovery
Hängt ein Recording in `downloading`/`transcribing`, gibt es **keinen** Mechanismus, das jemals wieder anzufassen. Es existiert bereits `vercel.json`-Crons-Infra (aktuell nur Mail) – hier fehlt ein Job, der `pending` und ältere `failed` Rows retry-t.
**Fix:** `/api/cron/yeastar-retry` + Eintrag in `vercel.json` (z.B. alle 15 Min).

#### 5. AssemblyAI-Polling kann Vercel-Function-Timeout überschreiten
[app/api/yeastar/process-call/route.ts:95-106](app/api/yeastar/process-call/route.ts#L95-L106) pollt bis zu 60×2s = **120 s**. Vercel Hobby limitiert Serverless auf 10 s, Pro auf 60 s, max 300 s mit `maxDuration`-Export. Ohne expliziten `export const maxDuration = 300` bricht die Function vorzeitig ab.
**Fix:** `maxDuration` setzen **und** den ganzen Pfad in einen Cron/Queue-Worker verlagern (s. Punkt 4).

#### 6. In-Memory Token-Cache überlebt Cold Starts nicht
[lib/yeastarApi.ts:10](lib/yeastarApi.ts#L10) – pro Serverless-Instanz separat, kein Refresh-Nutzen über Instanzen hinweg. Bei vielen Calls = viele Token-Requests, irgendwann Rate-Limit.
**Fix:** Token in einer `yeastar_tokens`-Tabelle halten (oder Vercel KV/Upstash).

### 🟡 Multitenancy

#### 7. `yeastar_webhook_events` hat **keine** `practice_id`
[supabase/migrations/20260416000001_yeastar_webhook_events.sql](supabase/migrations/20260416000001_yeastar_webhook_events.sql) – alle Tenants landen im selben Topf. Aktuell egal (nur eine Praxis), aber pro CLAUDE.md-Multitenancy-Regel inkonsistent. RLS ist zwar aktiv, hat aber **keine Policy** – niemand außer Service-Role kann lesen. [app/api/yeastar/events/route.ts:59](app/api/yeastar/events/route.ts#L59) nutzt daher den User-Client, der dank fehlender Policy leere Ergebnisse liefert – außer es gab hier eine separate Policy-Migration, die ich nicht gefunden habe.
**Fix:** Policy ergänzen und Spalte `practice_id uuid` nachziehen, sobald Webhook die Praxis kennt (Punkt 1).

#### 8. Recordings-Liste filtert nicht explizit auf Praxis
[app/api/yeastar/recordings/route.ts:37-47](app/api/yeastar/recordings/route.ts#L37-L47) verlässt sich vollständig auf RLS. Funktioniert, aber defense-in-depth-mäßig sollte man `practice_id` explizit per `getUserPractice()` setzen (siehe Muster in `lib/server/getUserPractice.ts`).

### 🟡 Sicherheit

#### 9. `/api/yeastar/autorecord` hat **keinerlei Auth**
[app/api/yeastar/autorecord/route.ts](app/api/yeastar/autorecord/route.ts) – jeder unauthentifizierte Request kann die Aufnahme der gesamten PBX ein/ausschalten. **Dringend.**
**Fix:** Gleiche `resolveAccess`-Logik wie in [app/api/yeastar/route.ts:45-84](app/api/yeastar/route.ts#L45-L84), nur für Admin-Rolle.

#### 10. Webhook verifiziert nur optionales Secret
Wenn `YEASTAR_WEBHOOK_SECRET` nicht gesetzt ist, akzeptiert der Webhook jeden POST. Keine IP-Allowlist, keine Signaturprüfung.
**Fix:** Secret zur Pflicht machen (Early-Return wenn Env leer), optional IP-Check.

### 🟡 Datenmodell / Feature-Lücken

#### 11. Keine Verknüpfung Anruf ↔ Patient / Besitzer
Summary steht isoliert. Keine Auflösung `caller`-Nummer → `patients.owner_phone` o.ä. Kein Link zu offenem Fall.
**Fix:** Nach Summary-Schritt Phone-Lookup in `patients` + optionale Referenz `call_recordings.patient_id`/`case_id`.

#### 12. Keine Benachrichtigung bei fertiger Summary
Zusammenfassung liegt nur in der UI. Kein Slack-Post, keine Push, keine E-Mail. Für „nach jedem Gespräch" heißt das: Personal muss aktiv auf die Seite gehen, um Ergebnisse zu sehen – der Haupt-Nutzen des Features verpufft.
**Fix:** Nach `done` optional `slack.sendMessage(...)` in einen Team-Channel (`lib/server/slack.ts` existiert bereits), oder In-App-Notification.

#### 13. `recording_url` wird beim Abschluss bewusst auf `null` gesetzt
[app/api/yeastar/process-call/route.ts:205](app/api/yeastar/process-call/route.ts#L205) mit Kommentar „privacy". Heißt aber: kein Re-Play, keine manuelle Nachkontrolle möglich. Entscheidung bewusst? Wenn ja dokumentieren, wenn nein: Signed-URL-System statt Komplettverlust.

### 🟢 Kleinkram

#### 14. [app/api/yeastar/route.ts](app/api/yeastar/route.ts) nutzt noch alte `YEASTAR_API_KEY`/`YEASTAR_ACCESS_TOKEN`-Env-Authentifizierung (Zeilen [86-93](app/api/yeastar/route.ts#L86-L93)), während der Rest bereits OAuth nutzt – inkonsistent, `/api/yeastar` GET benutzt nicht `yeastarRequest`.

#### 15. `listRecordings` / `searchRecordings` in [lib/yeastarApi.ts:117-125](lib/yeastarApi.ts#L117-L125) akzeptieren Parameter, leiten sie aber nicht an die API weiter. Tote Parameter.

#### 16. Webhook-URL im UI wird aus `window.location.origin` gebaut ([app/kommunikation/page.tsx:393](app/kommunikation/page.tsx#L393)). Auf Vercel-Preview-Deployments zeigt die URL auf die Preview, die Yeastar niemals erreicht. Für das Admin-Setup-Panel: hartkodierte Prod-URL anzeigen oder aus Env lesen.

#### 17. UI-State wird nicht live aktualisiert – nach Eingang eines neuen Recordings muss der Nutzer manuell „🔄 Aktualisieren" klicken. Kein Polling, kein Realtime-Channel.

---

## Empfohlene Reihenfolge zum Aktivieren

1. **Blocker 1 + 2 fixen** (practice_id + GET-Query). Ohne das läuft **gar nichts**.
2. **Blocker 9 fixen** (Auth auf `/autorecord`) – Sicherheitsloch.
3. **Punkt 3 + 4 umbauen**: Webhook insert-only → Cron-Worker verarbeitet pendings. Robuster als fire-and-forget und löst gleichzeitig das Vercel-Timeout-Problem.
4. **Punkt 12 anbinden**: Slack-Benachrichtigung bei `done`. Damit ist der Flow für die Praxis spürbar.
5. **Punkt 11**: Patienten-Matching per Telefonnummer.
6. Rest (Token-Cache, Retry-Details, UI-Polish) nach Bedarf.

## Env-Variablen-Inventar (nötig für Betrieb)

| Variable | Zweck | Status im Code |
|----------|-------|----------------|
| `YEASTAR_API_BASE_URL` | PBX-OpenAPI-Basis | genutzt |
| `YEASTAR_CLIENT_ID` + `YEASTAR_CLIENT_SECRET` | OAuth | genutzt |
| `YEASTAR_ACCESS_TOKEN` / `YEASTAR_API_KEY` | Fallback | genutzt |
| `YEASTAR_WEBHOOK_SECRET` | Webhook-Absicherung | optional, sollte Pflicht werden |
| `YEASTAR_CALLS_PATH` | CDR-Pfad-Override | nur in [route.ts](app/api/yeastar/route.ts) genutzt |
| `OPENAI_API_KEY` | Whisper + GPT-4o | genutzt |
| `ASSEMBLYAI_API_KEY` | Transkript-Fallback | genutzt |
| `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Webhook-DB-Inserts | genutzt |
| *(neu)* `YEASTAR_DEFAULT_PRACTICE_ID` | Pragma-Lösung für Blocker 1 | fehlt |
