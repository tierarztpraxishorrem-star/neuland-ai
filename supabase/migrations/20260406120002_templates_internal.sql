-- User-scoped templates migration:
-- 1) ensure templates.user_id exists
-- 2) migrate category admin -> internal
-- 3) create "Teamkommunikation intern" for each existing template owner if missing

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE templates
SET category = 'internal'
WHERE LOWER(COALESCE(category, '')) = 'admin';

INSERT INTO templates (name, category, content, structure, user_id)
SELECT
  'Teamkommunikation intern',
  'internal',
  E'Du bist ein tierärztlicher Assistent zur internen Teamkommunikation.\n\nErstelle eine klare, strukturierte Zusammenfassung eines Gesprächs für das Praxisteam.\n\nSTRUKTUR:\n\n# Zusammenfassung\n- kurze, prägnante Zusammenfassung des Gesprächs\n- wichtigste Entscheidungen\n- keine unnötigen Details\n\n# Relevante Inhalte\n- medizinische Inhalte (falls vorhanden)\n- organisatorische Punkte\n- Besonderheiten oder Probleme\n\n# To-do (verantwortlich + wann)\n- Aufgabe: Verantwortlicher – Zeitpunkt/Frist\n- nur konkrete Aufgaben\n- maximal klare Formulierung\n\n# Hinweise / Offene Punkte\n- Dinge, die noch geklärt werden müssen\n- Rückfragen\n- Unsicherheiten\n\nREGELN:\n- knapp, verständlich, teamtauglich\n- keine Wiederholungen\n- keine Interpretation\n- klare Zuordnung der Aufgaben',
  NULL,
  u.user_id
FROM (
  SELECT DISTINCT user_id
  FROM templates
  WHERE user_id IS NOT NULL
) u
WHERE NOT EXISTS (
  SELECT 1
  FROM templates t
  WHERE t.user_id = u.user_id
    AND t.name = 'Teamkommunikation intern'
    AND t.category = 'internal'
);
