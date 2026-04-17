-- ============================================================
-- Phase 8: Integrationen & Globale Suche
-- ============================================================

-- 1. Export-Log
CREATE TABLE IF NOT EXISTS hr_export_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  export_type     TEXT NOT NULL CHECK (export_type IN ('datev', 'csv', 'pdf')),
  parameters      JSONB,
  file_name       TEXT,
  row_count       INTEGER,
  created_by      UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE hr_export_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_export_log_select ON hr_export_log;
CREATE POLICY hr_export_log_select
  ON hr_export_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = hr_export_log.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS hr_export_log_insert ON hr_export_log;
CREATE POLICY hr_export_log_insert
  ON hr_export_log FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships pm
      WHERE pm.practice_id = hr_export_log.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- 2. Volltext-Suche auf employees
-- GIN-Index für schnelle Suche
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_employees_fts') THEN
    CREATE INDEX idx_employees_fts ON employees USING GIN (
      to_tsvector('german',
        COALESCE(first_name, '') || ' ' ||
        COALESCE(last_name, '') || ' ' ||
        COALESCE(display_name, '') || ' ' ||
        COALESCE(personnel_number, '') || ' ' ||
        COALESCE(department, '') || ' ' ||
        COALESCE(position_title, '') || ' ' ||
        COALESCE(email_private, '')
      )
    );
  END IF;
END $$;

-- Search-Function
CREATE OR REPLACE FUNCTION hr_search_employees(
  p_practice_id UUID,
  p_query TEXT,
  p_limit INT DEFAULT 20
) RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT,
  personnel_number TEXT,
  department TEXT,
  position_title TEXT,
  employment_status TEXT,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.first_name,
    e.last_name,
    e.display_name,
    e.personnel_number,
    e.department,
    e.position_title,
    e.employment_status,
    ts_rank(
      to_tsvector('german',
        COALESCE(e.first_name, '') || ' ' ||
        COALESCE(e.last_name, '') || ' ' ||
        COALESCE(e.display_name, '') || ' ' ||
        COALESCE(e.personnel_number, '') || ' ' ||
        COALESCE(e.department, '') || ' ' ||
        COALESCE(e.position_title, '')
      ),
      plainto_tsquery('german', p_query)
    ) AS rank
  FROM employees e
  WHERE e.practice_id = p_practice_id
    AND (
      to_tsvector('german',
        COALESCE(e.first_name, '') || ' ' ||
        COALESCE(e.last_name, '') || ' ' ||
        COALESCE(e.display_name, '') || ' ' ||
        COALESCE(e.personnel_number, '') || ' ' ||
        COALESCE(e.department, '') || ' ' ||
        COALESCE(e.position_title, '')
      ) @@ plainto_tsquery('german', p_query)
      OR e.first_name ILIKE '%' || p_query || '%'
      OR e.last_name ILIKE '%' || p_query || '%'
      OR e.personnel_number ILIKE '%' || p_query || '%'
    )
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
