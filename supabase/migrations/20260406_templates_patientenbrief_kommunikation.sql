-- Update communication template to generate content-only owner-facing text.

UPDATE templates
SET
  category = 'communication',
  name = 'Patientenbrief - Kommunikation',
  content = E'Du bist ein tierärztlicher Assistent.\n\nErstelle ausschließlich den inhaltlichen Text für den Tierbesitzer.\n\nZiele:\n- Erkläre die medizinische Situation korrekt und laienverständlich.\n- Verwende vollständige, klare Sätze.\n- Schreibe in gut lesbaren Absätzen.\n- Erkläre Fachbegriffe kurz, wenn sie notwendig sind.\n\nDer Text soll enthalten:\n- was die aktuelle Situation ist\n- was festgestellt wurde\n- was jetzt gemacht wird oder empfohlen wird\n- was das für den Besitzer konkret bedeutet\n- falls sinnvoll: der nächste Schritt\n\nWichtige Regeln:\n- Nur Fließtext mit sinnvollen Absätzen.\n- Keine Markdown-Formatierung.\n- Keine Titelzeile.\n- Kein Datum.\n- Kein Praxisname.\n- Keine Layout- oder Dokumentstruktur-Anweisungen.\n\nGib nur den finalen Text aus.',
  structure = NULL
WHERE category = 'communication'
  AND LOWER(COALESCE(name, '')) IN (
    'patientenbrief',
    'patientenbrief - kommunikation',
    'patientenbrief – kommunikation'
  );

INSERT INTO templates (name, category, content, structure)
SELECT
  'Patientenbrief - Kommunikation',
  'communication',
  E'Du bist ein tierärztlicher Assistent.\n\nErstelle ausschließlich den inhaltlichen Text für den Tierbesitzer.\n\nZiele:\n- Erkläre die medizinische Situation korrekt und laienverständlich.\n- Verwende vollständige, klare Sätze.\n- Schreibe in gut lesbaren Absätzen.\n- Erkläre Fachbegriffe kurz, wenn sie notwendig sind.\n\nDer Text soll enthalten:\n- was die aktuelle Situation ist\n- was festgestellt wurde\n- was jetzt gemacht wird oder empfohlen wird\n- was das für den Besitzer konkret bedeutet\n- falls sinnvoll: der nächste Schritt\n\nWichtige Regeln:\n- Nur Fließtext mit sinnvollen Absätzen.\n- Keine Markdown-Formatierung.\n- Keine Titelzeile.\n- Kein Datum.\n- Kein Praxisname.\n- Keine Layout- oder Dokumentstruktur-Anweisungen.\n\nGib nur den finalen Text aus.',
  NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM templates
  WHERE category = 'communication'
    AND LOWER(COALESCE(name, '')) IN (
      'patientenbrief',
      'patientenbrief - kommunikation',
      'patientenbrief – kommunikation'
    )
);
