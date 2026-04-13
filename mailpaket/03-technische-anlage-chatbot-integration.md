# Technische Anlage: Chatbot-Integration

## Ziel

Stabile und wartbare Einbindung des Chatbots mit maximaler Kompatibilität zu bestehenden Website-Plugins.

## Empfohlene Integrationsvariante

iframe-/Widget-Einbindung (gekapselt) statt direkter HTML-Snippet-Einbettung.

## Warum diese Variante

- minimiert CSS/JS-Konflikte
- reduziert Risiko durch Theme- oder Plugin-Updates
- klare Isolation der Chat-Logik
- rollback-fähig

## Endpoint / Ziel

- Chatbot Hauptseite: https://chat.tzn-bergheim.de
- Embed-Ansicht: https://chat.tzn-bergheim.de/embed

## Einbau-Beispiel (iframe)

```html
<div style="width:100%;max-width:420px;min-height:640px;">
  <iframe
    src="https://chat.tzn-bergheim.de/embed"
    title="TZN Chatbot"
    style="width:100%;height:640px;border:0;border-radius:16px;"
    loading="lazy"
    referrerpolicy="strict-origin-when-cross-origin"
    allow="clipboard-write"
  ></iframe>
</div>
```

## Einbau-Orte

- optional floating (unten rechts)
- alternativ feste Platzierung auf Kontakt-/Service-Seiten

## Kompatibilitätsprüfung vor Go-live

1. Theme-Kompatibilität (Desktop/Mobil)
2. Konflikte mit Consent-Manager
3. Konflikte mit Security-/Cache-Plugins
4. Darstellung in Chrome/Safari/Firefox
5. Performance-Messung (Core Web Vitals)

## Consent-Einbindung

- optionales lazy loading nach Consent möglich
- empfohlen: klare Kategoriezuordnung im Consent-Tool

## Monitoring nach Go-live

- Chat-Fehlerquote
- Ladezeit des Widgets
- Conversion in Zielaktionen (z. B. Termin, Anruf)
