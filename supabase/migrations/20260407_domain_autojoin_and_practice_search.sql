-- Domain-based auto-join requests, owner notifications, and review workflow.

CREATE TABLE IF NOT EXISTS practice_domain_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  domain text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_domain_links_domain_check CHECK (position('@' in domain) = 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_domain_links_unique_domain
  ON practice_domain_links (lower(domain));

CREATE TABLE IF NOT EXISTS practice_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  email_domain text NOT NULL,
  requested_role text NOT NULL DEFAULT 'member' CHECK (requested_role IN ('member', 'admin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_join_requests_unique_pending
  ON practice_join_requests (practice_id, user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_practice_join_requests_practice_id
  ON practice_join_requests (practice_id);

CREATE TABLE IF NOT EXISTS practice_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_practice_notifications_practice_id
  ON practice_notifications (practice_id);

ALTER TABLE practice_domain_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practice_domain_links_select_member ON practice_domain_links;
CREATE POLICY practice_domain_links_select_member
  ON practice_domain_links
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_domain_links.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS practice_domain_links_manage_admin ON practice_domain_links;
CREATE POLICY practice_domain_links_manage_admin
  ON practice_domain_links
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_domain_links.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_domain_links.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS practice_join_requests_select_member_or_self ON practice_join_requests;
CREATE POLICY practice_join_requests_select_member_or_self
  ON practice_join_requests
  FOR SELECT
  TO authenticated
  USING (
    practice_join_requests.user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_join_requests.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS practice_join_requests_update_admin ON practice_join_requests;
CREATE POLICY practice_join_requests_update_admin
  ON practice_join_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_join_requests.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_join_requests.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS practice_notifications_select_member ON practice_notifications;
CREATE POLICY practice_notifications_select_member
  ON practice_notifications
  FOR SELECT
  TO authenticated
  USING (
    (practice_notifications.user_id IS NULL OR practice_notifications.user_id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_notifications.practice_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS practice_notifications_update_target ON practice_notifications;
CREATE POLICY practice_notifications_update_target
  ON practice_notifications
  FOR UPDATE
  TO authenticated
  USING (
    (practice_notifications.user_id IS NULL OR practice_notifications.user_id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_notifications.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    (practice_notifications.user_id IS NULL OR practice_notifications.user_id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM practice_memberships pm
      WHERE pm.practice_id = practice_notifications.practice_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

CREATE OR REPLACE FUNCTION request_practice_join_by_email_domain()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_domain text;
  v_practice_id uuid;
  v_request_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT lower(coalesce(au.email, ''))
  INTO v_email
  FROM auth.users au
  WHERE au.id = v_user_id;

  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  v_domain := split_part(v_email, '@', 2);

  SELECT pdl.practice_id
  INTO v_practice_id
  FROM practice_domain_links pdl
  WHERE lower(pdl.domain) = v_domain
  LIMIT 1;

  IF v_practice_id IS NULL THEN
    RAISE EXCEPTION 'no_domain_match';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM practice_memberships pm
    WHERE pm.practice_id = v_practice_id
      AND pm.user_id = v_user_id
  ) THEN
    RETURN v_practice_id;
  END IF;

  INSERT INTO practice_join_requests (practice_id, user_id, email, email_domain, requested_role)
  VALUES (v_practice_id, v_user_id, v_email, v_domain, 'member')
  ON CONFLICT (practice_id, user_id)
  WHERE status = 'pending'
  DO NOTHING;

  SELECT pjr.id
  INTO v_request_id
  FROM practice_join_requests pjr
  WHERE pjr.practice_id = v_practice_id
    AND pjr.user_id = v_user_id
    AND pjr.status = 'pending'
  ORDER BY pjr.created_at DESC
  LIMIT 1;

  INSERT INTO practice_notifications (practice_id, user_id, type, message, payload)
  SELECT
    v_practice_id,
    pm.user_id,
    'join_request',
    format('Neue Beitrittsanfrage von %s (%s)', v_email, v_domain),
    jsonb_build_object('request_id', v_request_id, 'email', v_email, 'domain', v_domain)
  FROM practice_memberships pm
  WHERE pm.practice_id = v_practice_id
    AND pm.role IN ('owner', 'admin');

  RETURN v_practice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION request_practice_join_by_email_domain() TO authenticated;

CREATE OR REPLACE FUNCTION review_practice_join_request(p_request_id uuid, p_approve boolean, p_role text DEFAULT 'member')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_req practice_join_requests%ROWTYPE;
  v_role text := lower(coalesce(p_role, 'member'));
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_role NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  SELECT *
  INTO v_req
  FROM practice_join_requests
  WHERE id = p_request_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM practice_memberships pm
    WHERE pm.practice_id = v_req.practice_id
      AND pm.user_id = v_actor
      AND pm.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_approve THEN
    INSERT INTO practice_memberships (practice_id, user_id, role)
    VALUES (v_req.practice_id, v_req.user_id, v_role)
    ON CONFLICT (practice_id, user_id)
    DO UPDATE SET role = EXCLUDED.role;

    UPDATE practice_join_requests
    SET status = 'approved',
        reviewed_by = v_actor,
        reviewed_at = now(),
        requested_role = v_role
    WHERE id = v_req.id;

    INSERT INTO practice_notifications (practice_id, user_id, type, message, payload)
    VALUES (
      v_req.practice_id,
      v_req.user_id,
      'join_request_approved',
      'Deine Praxisanfrage wurde freigegeben.',
      jsonb_build_object('request_id', v_req.id, 'role', v_role)
    );
  ELSE
    UPDATE practice_join_requests
    SET status = 'rejected',
        reviewed_by = v_actor,
        reviewed_at = now()
    WHERE id = v_req.id;

    INSERT INTO practice_notifications (practice_id, user_id, type, message, payload)
    VALUES (
      v_req.practice_id,
      v_req.user_id,
      'join_request_rejected',
      'Deine Praxisanfrage wurde abgelehnt.',
      jsonb_build_object('request_id', v_req.id)
    );
  END IF;

  RETURN v_req.practice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION review_practice_join_request(uuid, boolean, text) TO authenticated;
