# Antwort an Alex und Herr Schlömer (versandfertig)

Hallo Alex, hallo Herr Schlömer,

vielen Dank für eure Rückmeldung. Wir haben die angefragten Unterlagen und technischen Eckdaten zusammengestellt.

## 1) Datenverarbeitung / Vercel

Für eure datenschutzrechtliche Prüfung:

- Vercel Privacy Policy: https://vercel.com/legal/privacy-policy
- Vercel Data Processing Addendum (DPA): https://vercel.com/legal/dpa
- Security/Subprocessor-Übersicht: https://security.vercel.com

Wesentliche Punkte aus den Unterlagen:

- Vercel verarbeitet Kundendaten im Rahmen der bereitgestellten Services.
- Es bestehen Regelungen zu Subprozessoren, TOMs, Löschung und internationalen Datentransfers.
- Laut DPA sind bei Enterprise/Pro-Setups klare Rollen als Processor dokumentiert.
- Verschlüsselung in Transit und at Rest ist beschrieben.

## 2) Einbindungsweg (empfohlen)

Wir empfehlen die Einbindung über ein gekapseltes Widget/iframe statt über „simples HTML“.

Vorteile:

- geringeres Risiko von Konflikten mit bestehenden Plugins/Themes
- bessere Wartbarkeit bei Updates
- klare Trennung von Styles und JavaScript

## 3) Cookie-/Consent-Einordnung (technische Sicht)

Der Chatbot ist funktional und verarbeitet Nutzereingaben sowie technische Request-Daten für die Antwortauslieferung.

- keine Werbe-/Tracking-Funktion des Chatbots selbst vorgesehen
- Einordnung im Consent-Banner typischerweise als funktional/technisch erforderlich (finale juristische Freigabe durch euch)
- optional kann der Chatbot erst nach Consent geladen werden

## 4) Nächster Schritt

Wenn ihr einverstanden seid, gehen wir in folgender Reihenfolge vor:

1. technische Prüfung auf Zielseite (Theme/Plugin-Kompatibilität)
2. Datenschutztext in eure Datenschutzerklärung aufnehmen
3. bevorzugte Integration (iframe/widget)
4. Abnahme in Staging
5. Produktivschaltung

Optional stellen wir euch zusätzlich einen temporären Zugang zur Staging-Umgebung bereit.

Viele Grüße
