# DSGVO-Audit: Chatbot-Implementierung (Frontend + Backend + API + Deployment)

Datum: 08.04.2026

## 1) Bestandsanalyse

### Verarbeitete Daten

- User-Input im Chat (Freitext)
- KI-Antworten (assistierte Inhalte)
- Optionaler Kontextblock (falls vom Frontend uebergeben)

### Externe Dienste

- OpenAI API (`https://api.openai.com/v1/responses`) fuer Antwortgenerierung
- Vercel als Hosting-/Deployment-Plattform (Next.js App)
- Supabase ist im Projekt enthalten, aber nicht Kern der `/api/chat`-Antwortroute

### Speicherung / Logging

- In `app/api/chat/route.ts` erfolgt keine persistente Speicherung von Chatinhalten.
- In der jetzt angepassten `app/chat/page.tsx` wird nur die Consent-Entscheidung lokal gespeichert (`localStorage`).
- Kein serverseitiges Chat-Logging in der `/api/chat`-Route.

## 2) Risikobewertung

### Kritische Punkte (vor Anpassung)

- Kein zwingender Consent-Gate im Chat-Frontend
- Kein verpflichtender Datenschutzhinweis vor Start
- Keine Absicherung gegen unnoetige Payload-Groessen an OpenAI
- Keine explizite `store: false`-Konfiguration in OpenAI-Request

### Umgesetzte Gegenmassnahmen

- Consent erforderlich fuer Public-Chat-Channel (Frontend + API-Pruefung)
- Datenschutzhinweis beim ersten Oeffnen vor Chat-Start
- Datenminimierung in API (Trim, Rollen-Filter, Message-Limit, Context-Limit)
- `store: false` im OpenAI-Request
- Unsicherheits-Hinweis unter potenziell unsicheren Antworten

## 3) Umgesetzte Code-Aenderungen

- `lib/privacyConfig.ts`
  - zentrale Privacy-Konfiguration
  - Consent-Storage-Key und Public-Chat-Channel-Konstante

- `app/api/chat/route.ts`
  - Sanitizing und Begrenzung von Nachrichten/Kontext
  - Consent-Pruefung fuer Public-Chat-Requests
  - OpenAI `store: false`
  - klare Typen fuer Request-Body

- `app/chat/page.tsx`
  - Consent-Gate mit `Chat starten`
  - Pflicht-Datenschutzhinweis vor erster Nutzung
  - lokale Consent-Speicherung (`localStorage`)
  - Streaming-kompatible Antwortverarbeitung
  - Unsicherheits-Hinweis bei unsicher formulierten Antworten

## 4) Deployment-Hinweise

- App laeuft auf Vercel; Datenschutz- und Auftragsverarbeitung sind organisatorisch ueber Vercel DPA/Policy abzudecken.
- Technisch relevant: Secrets nur serverseitig (OPENAI_API_KEY bleibt in API-Route).

## 5) Testfaelle

1. Chat ohne Zustimmung
   - Erwartung: kein API-Call aus `app/chat/page.tsx`, Senden deaktiviert.

2. Chat nach Zustimmung
   - Erwartung: API-Call funktioniert normal, Antwort streamt in UI.

3. Datenschutzhinweis
   - Erwartung: vor Chat-Start sichtbar; nach Zustimmung weiterhin dezent im Chatbereich sichtbar.

4. Unsicherheits-Hinweis
   - Erwartung: erscheint unter Assistant-Antworten mit Unsicherheitsmustern.

5. API-Datenminimierung
   - Erwartung: nur begrenzte/validierte Nachrichtendaten werden an OpenAI gesendet.

## 6) Offene Restpunkte (organisatorisch)

- Datenschutzerklaerung der Website mit final juristisch geprueften Formulierungen aktualisieren.
- Consent-Management auf Gesamtsite-Ebene (CMP) mit Kategorie-Zuordnung final abstimmen.
- Aufbewahrungs-/Loeschkonzept fuer alle KI-bezogenen Features dokumentieren (auch ausserhalb von `/api/chat`).

## 7) Stand nach Bereinigung

- Die zuvor eingefuehrte Insights-Funktion fuer Chat-Logging wurde aus dem Neuland-AI-Projekt entfernt.
- Es bleibt bei datensparsamer Chat-Verarbeitung ohne dedizierte Insights-API.
