Erstelle eine neue API-Route für das HR-Modul.

Pflichtstruktur:
1. JWT aus Authorization-Header lesen + validieren
2. Supabase-Client mit User-Token initialisieren (RLS greift)
3. employee_id aus employees-Tabelle laden
4. Business-Logik
5. Fehler auf Deutsch zurückgeben
6. try/catch um alles

Datei anlegen unter: /app/api/hr/$ARGUMENTS/route.ts
