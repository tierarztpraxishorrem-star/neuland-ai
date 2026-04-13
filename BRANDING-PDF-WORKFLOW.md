# TZN Branding fuer Besitzer-Kommunikation und PDF

## Ziel

Alle ausgehenden Besitzer-Texte und PDFs nutzen ein einheitliches, hochwertiges TZN-Design mit Logo, Praxisdaten und konsistenter Typografie.

## Was bereits eingebaut ist

- Zentrale Druckvorlage fuer Besitzerbriefe: `lib/ownerCommunicationTemplate.ts`
- Aufgeraeumter Druck aus Konsultation: `app/konsultation/page.tsx`
- Aufgewertetes PDF-Design (Header, Metadaten, Footer): `lib/pdfReport.ts`

## So nutzt du es im Alltag

1. In Admin die Praxisdaten und das Logo pflegen
   - Bereich: `Admin -> Praxisdaten fuer PDF`
2. In Konsultation den Besitzerbrief erzeugen und drucken
   - Das neue Layout wird automatisch verwendet
3. PDF aus VetMind oder Ergebnisansicht erstellen
   - Das PDF nutzt automatisch das gebrandete Template

## Optionaler naechster Schritt

Wenn auch E-Mails (nicht nur Print/PDF) im gleichen Layout rausgehen sollen:

- zentrale HTML-E-Mail-Templates in `lib/ownerCommunicationTemplate.ts` erweitern
- Versandserver (z. B. Resend, Postmark, SMTP) anbinden
- pro Kommunikationstyp einen festen Corporate-Block nutzen
