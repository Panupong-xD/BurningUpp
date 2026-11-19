-- ============================================================================
-- BURNING UPP — COMPREHENSIVE SECURITY HARDENING & DATABASE BUGFIX MIGRATION
-- ============================================================================

-- 1. LEAST-PRIVILEGE TABLE GRANTS
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'workspaces', 'workspace_members', 'teams', 'team_members',
    'invitations', 'mood_entries', 'assessment_templates', 'assessment_questions',
    'assessment_campaigns', 'assessment_responses', 'assessment_answers',
    'assessment_results', 'team_reports', 'follow_ups', 'consent_records', 'audit_logs'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated;', t);
  END LOOP;
END $$;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT SELECT ON public.invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mood_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.assessment_templates TO authenticated;
GRANT SELECT ON public.assessment_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_answers TO authenticated;
GRANT SELECT, DELETE ON public.assessment_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_ups TO authenticated;
GRANT SELECT, INSERT ON public.consent_records TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

-- 2. BACKFILL EXISTING INVITATION HASHES TO SHA-256(upper(token))
UPDATE public.invitations
SET token_hash = encode(extensions.digest(upper(token), 'sha256'), 'hex')
WHERE token_hash IS DISTINCT FROM encode(extensions.digest(upper(token), 'sha256'), 'hex');

-- 3. COMPOSITE TENANT FOREIGN KEYS & DATA INTEGRITY CONSTRAINTS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_members_ws_user_fkey') THEN
    ALTER TABLE public.team_members
      ADD CONSTRAINT team_members_ws_user_fkey
      FOREIGN KEY (workspace_id, user_id)
      REFERENCES public.workspace_members(workspace_id, user_id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mood_entries_ws_team_fkey') THEN
    ALTER TABLE public.mood_entries
      ADD CONSTRAINT mood_entries_ws_team_fkey
      FOREIGN KEY (workspace_id, team_id)
      REFERENCES public.teams(workspace_id, id)
      ON DELETE SET NULL (team_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mood_entries_factors_valid_chk') THEN
    ALTER TABLE public.mood_entries
      ADD CONSTRAINT mood_entries_factors_valid_chk
      CHECK (
        factors <@ ARRAY['workload', 'sleep', 'rest', 'environment', 'personal']::text[]
        AND coalesce(array_length(factors, 1), 0) <= 5
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assessment_campaigns_ws_team_fkey') THEN
    ALTER TABLE public.assessment_campaigns
      ADD CONSTRAINT assessment_campaigns_ws_team_fkey
      FOREIGN KEY (workspace_id, team_id)
      REFERENCES public.teams(workspace_id, id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assessment_campaigns_dates_chk') THEN
    ALTER TABLE public.assessment_campaigns
      ADD CONSTRAINT assessment_campaigns_dates_chk
      CHECK (due_date IS NULL OR due_date >= starts_at);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assessment_responses_ws_team_fkey') THEN
    ALTER TABLE public.assessment_responses
      ADD CONSTRAINT assessment_responses_ws_team_fkey
      FOREIGN KEY (workspace_id, team_id)
      REFERENCES public.teams(workspace_id, id)
      ON DELETE SET NULL (team_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assessment_results_ws_team_fkey') THEN
    ALTER TABLE public.assessment_results
      ADD CONSTRAINT assessment_results_ws_team_fkey
      FOREIGN KEY (workspace_id, team_id)
      REFERENCES public.teams(workspace_id, id)
      ON DELETE SET NULL (team_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_reports_ws_team_fkey') THEN
    ALTER TABLE public.team_reports
      ADD CONSTRAINT team_reports_ws_team_fkey
      FOREIGN KEY (workspace_id, team_id)
      REFERENCES public.teams(workspace_id, id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_reports_period_chk') THEN
    ALTER TABLE public.team_reports
      ADD CONSTRAINT team_reports_period_chk
      CHECK (period_end >= period_start);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'follow_ups_ws_team_fkey') THEN
    ALTER TABLE public.follow_ups
      ADD CONSTRAINT follow_ups_ws_team_fkey
      FOREIGN KEY (workspace_id, team_id)
      REFERENCES public.teams(workspace_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 4. SECURITY HELPER FUNCTIONS & TRIGGERS
CREATE OR REPLACE FUNCTION private.is_user_workspace_owner(
  target_workspace_id uuid,
  target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = target_workspace_id
      AND wm.user_id = target_user_id
      AND wm.role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION private.is_team_member(
  target_workspace_id uuid,
  target_team_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.workspace_id = target_workspace_id
      AND tm.team_id = target_team_id
      AND tm.user_id = (SELECT auth.uid())
  );
$$;

-- Tighten legacy shares_workspace_with helper to self-only and revoke execute
CREATE OR REPLACE FUNCTION private.shares_workspace_with(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT target_user_id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION private.shares_workspace_with(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_user_workspace_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_team_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_user_workspace_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_team_member(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.protect_profile_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
     AND current_setting('burningupp.allow_profile_email_sync', true) IS DISTINCT FROM 'on' THEN
    NEW.email := OLD.email;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.protect_profile_immutable_fields() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER protect_profile_immutable_fields_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_profile_immutable_fields();

CREATE OR REPLACE FUNCTION private.validate_mood_entry_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bangkok_today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
BEGIN
  IF NEW.entry_date < DATE '2020-01-01' OR NEW.entry_date > (v_bangkok_today + 1) THEN
    RAISE EXCEPTION 'วันที่บันทึกอารมณ์ไม่ถูกต้อง' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_mood_entry_date() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER validate_mood_entry_date_trg
  BEFORE INSERT OR UPDATE ON public.mood_entries
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_mood_entry_date();

-- 5. HARDENED RLS POLICIES (via non-destructive ALTER POLICY)

ALTER POLICY profiles_select_policy ON public.profiles
  USING (id = (SELECT auth.uid()));

ALTER POLICY profiles_insert_policy ON public.profiles
  WITH CHECK (false);

ALTER POLICY workspaces_insert_policy ON public.workspaces
  WITH CHECK (false);

ALTER POLICY workspace_members_insert_policy ON public.workspace_members
  WITH CHECK (
    (SELECT private.is_workspace_owner(workspace_id))
    AND role IN ('leader', 'member')
  );

ALTER POLICY workspace_members_update_policy ON public.workspace_members
  USING (
    (SELECT private.is_workspace_owner(workspace_id))
    AND user_id <> (SELECT auth.uid())
  )
  WITH CHECK (
    (SELECT private.is_workspace_owner(workspace_id))
    AND user_id <> (SELECT auth.uid())
    AND role IN ('leader', 'member')
  );

ALTER POLICY workspace_members_delete_policy ON public.workspace_members
  USING (
    ((SELECT private.is_workspace_owner(workspace_id)) AND user_id <> (SELECT auth.uid()))
    OR (user_id = (SELECT auth.uid()) AND role <> 'owner')
  );

ALTER POLICY teams_insert_policy ON public.teams
  WITH CHECK (
    (SELECT private.is_workspace_leader(workspace_id))
    AND created_by = (SELECT auth.uid())
  );

ALTER POLICY team_members_update_policy ON public.team_members
  USING (
    (SELECT private.can_manage_team(workspace_id, team_id))
    AND user_id <> (SELECT auth.uid())
    AND NOT (SELECT private.is_user_workspace_owner(workspace_id, user_id))
  )
  WITH CHECK (
    (SELECT private.can_manage_team(workspace_id, team_id))
    AND user_id <> (SELECT auth.uid())
    AND NOT (SELECT private.is_user_workspace_owner(workspace_id, user_id))
  );

ALTER POLICY team_members_delete_policy ON public.team_members
  USING (
    user_id = (SELECT auth.uid())
    OR (
      (SELECT private.can_manage_team(workspace_id, team_id))
      AND NOT (SELECT private.is_user_workspace_owner(workspace_id, user_id))
    )
  );

ALTER POLICY invitations_insert_policy ON public.invitations
  WITH CHECK (false);

ALTER POLICY invitations_update_policy ON public.invitations
  USING (false)
  WITH CHECK (false);

ALTER POLICY invitations_delete_policy ON public.invitations
  USING (false);

ALTER POLICY mood_entries_insert_policy ON public.mood_entries
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (SELECT private.is_workspace_member(workspace_id))
    AND (team_id IS NULL OR (SELECT private.is_team_member(workspace_id, team_id)))
  );

ALTER POLICY mood_entries_update_policy ON public.mood_entries
  USING (
    user_id = (SELECT auth.uid())
    AND (SELECT private.is_workspace_member(workspace_id))
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (SELECT private.is_workspace_member(workspace_id))
    AND (team_id IS NULL OR (SELECT private.is_team_member(workspace_id, team_id)))
  );

ALTER POLICY assessment_campaigns_insert_policy ON public.assessment_campaigns
  WITH CHECK (
    (
      (SELECT private.is_workspace_leader(workspace_id))
      OR (team_id IS NOT NULL AND (SELECT private.can_manage_team(workspace_id, team_id)))
    )
    AND created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.assessment_templates t
      WHERE t.id = template_id
        AND t.is_active = true
        AND (t.workspace_id IS NULL OR t.workspace_id = assessment_campaigns.workspace_id)
    )
  );

ALTER POLICY assessment_campaigns_update_policy ON public.assessment_campaigns
  USING (
    (SELECT private.is_workspace_leader(workspace_id))
    OR (team_id IS NOT NULL AND (SELECT private.can_manage_team(workspace_id, team_id)))
  )
  WITH CHECK (
    (SELECT private.is_workspace_leader(workspace_id))
    OR (team_id IS NOT NULL AND (SELECT private.can_manage_team(workspace_id, team_id)))
  );

ALTER POLICY assessment_campaigns_delete_policy ON public.assessment_campaigns
  USING (
    (SELECT private.is_workspace_leader(workspace_id))
    OR (team_id IS NOT NULL AND (SELECT private.can_manage_team(workspace_id, team_id)))
  );

ALTER POLICY assessment_responses_insert_policy ON public.assessment_responses
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (SELECT private.is_workspace_member(workspace_id))
    AND status = 'in_progress'
    AND (team_id IS NULL OR (SELECT private.is_team_member(workspace_id, team_id)))
    AND (
      campaign_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.assessment_campaigns c
        WHERE c.id = campaign_id
          AND c.workspace_id = assessment_responses.workspace_id
          AND c.status = 'active'
      )
    )
  );

ALTER POLICY assessment_responses_update_policy ON public.assessment_responses
  USING (
    user_id = (SELECT auth.uid())
    AND (SELECT private.is_workspace_member(workspace_id))
    AND status = 'in_progress'
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (SELECT private.is_workspace_member(workspace_id))
    AND status = 'in_progress'
    AND (team_id IS NULL OR (SELECT private.is_team_member(workspace_id, team_id)))
  );

ALTER POLICY assessment_answers_select_policy ON public.assessment_answers
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.assessment_responses r
      WHERE r.id = response_id
        AND r.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY assessment_answers_insert_policy ON public.assessment_answers
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.assessment_responses r
      JOIN public.assessment_questions q ON q.template_id = r.template_id
      WHERE r.id = response_id
        AND r.user_id = (SELECT auth.uid())
        AND r.status = 'in_progress'
        AND q.id = question_id
    )
  );

ALTER POLICY assessment_answers_update_policy ON public.assessment_answers
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.assessment_responses r
      WHERE r.id = response_id
        AND r.user_id = (SELECT auth.uid())
        AND r.status = 'in_progress'
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.assessment_responses r
      JOIN public.assessment_questions q ON q.template_id = r.template_id
      WHERE r.id = response_id
        AND r.user_id = (SELECT auth.uid())
        AND r.status = 'in_progress'
        AND q.id = question_id
    )
  );

ALTER POLICY assessment_answers_delete_policy ON public.assessment_answers
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.assessment_responses r
      WHERE r.id = response_id
        AND r.user_id = (SELECT auth.uid())
        AND r.status = 'in_progress'
    )
  );

ALTER POLICY assessment_results_insert_policy ON public.assessment_results
  WITH CHECK (false);

ALTER POLICY team_reports_insert_policy ON public.team_reports
  WITH CHECK (
    (
      (SELECT private.is_workspace_leader(workspace_id))
      OR (team_id IS NOT NULL AND (SELECT private.can_manage_team(workspace_id, team_id)))
    )
    AND created_by = (SELECT auth.uid())
  );

ALTER POLICY team_reports_delete_policy ON public.team_reports
  USING (
    (SELECT private.is_workspace_leader(workspace_id))
    OR (team_id IS NOT NULL AND (SELECT private.can_manage_team(workspace_id, team_id)))
  );

ALTER POLICY follow_ups_insert_policy ON public.follow_ups
  WITH CHECK (
    (SELECT private.can_manage_team(workspace_id, team_id))
    AND created_by = (SELECT auth.uid())
  );

ALTER POLICY consent_records_insert_policy ON public.consent_records
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (workspace_id IS NULL OR (SELECT private.is_workspace_member(workspace_id)))
  );

ALTER POLICY audit_logs_insert_policy ON public.audit_logs
  WITH CHECK (false);

-- 6. HARDENED & BUG-FIXED RPC IMPLEMENTATIONS

CREATE OR REPLACE FUNCTION private.impl_ensure_user_profile(p_full_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_meta_name text;
  v_profile public.profiles%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT email,
         coalesce(
           nullif(trim(p_full_name), ''),
           nullif(trim(raw_user_meta_data ->> 'full_name'), ''),
           split_part(coalesce(email, 'ผู้ใช้งาน'), '@', 1)
         )
  INTO v_email, v_meta_name
  FROM auth.users
  WHERE id = v_uid;

  PERFORM set_config('burningupp.allow_profile_email_sync', 'on', true);

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (v_uid, coalesce(v_email, ''), left(coalesce(v_meta_name, 'ผู้ใช้งาน'), 100))
  ON CONFLICT (id) DO UPDATE
    SET email = coalesce(EXCLUDED.email, public.profiles.email),
        full_name = CASE
          WHEN p_full_name IS NOT NULL AND char_length(trim(p_full_name)) > 0
          THEN left(trim(p_full_name), 100)
          ELSE public.profiles.full_name
        END,
        updated_at = now()
  RETURNING * INTO v_profile;

  RETURN to_jsonb(v_profile);
END;
$$;

CREATE OR REPLACE FUNCTION private.impl_create_workspace_with_team(
  p_workspace_name text,
  p_first_team_name text,
  p_organization_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  v_ws public.workspaces%rowtype;
  v_team public.teams%rowtype;
  v_template_id uuid;
  v_inv_token text;
  v_inv_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  PERFORM private.impl_ensure_user_profile(NULL);

  IF char_length(trim(coalesce(p_workspace_name, ''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'ชื่อพื้นที่ทำงานต้องมีอย่างน้อย 1 และไม่เกิน 120 ตัวอักษร' USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(coalesce(p_first_team_name, ''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'ชื่อทีมแรกต้องมีอย่างน้อย 1 และไม่เกิน 120 ตัวอักษร' USING ERRCODE = '22023';
  END IF;

  IF p_organization_name IS NOT NULL AND char_length(trim(p_organization_name)) > 120 THEN
    RAISE EXCEPTION 'ชื่อองค์กรต้องไม่เกิน 120 ตัวอักษร' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.workspaces (name, organization_name, created_by)
  VALUES (
    trim(p_workspace_name),
    nullif(trim(coalesce(p_organization_name, '')), ''),
    v_uid
  )
  RETURNING * INTO v_ws;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_ws.id, v_uid, 'owner');

  INSERT INTO public.teams (workspace_id, name, description, created_by)
  VALUES (v_ws.id, trim(p_first_team_name), 'ทีมหลักของพื้นที่ทำงาน', v_uid)
  RETURNING * INTO v_team;

  INSERT INTO public.team_members (workspace_id, team_id, user_id, role)
  VALUES (v_ws.id, v_team.id, v_uid, 'leader');

  SELECT id INTO v_template_id
  FROM public.assessment_templates
  WHERE slug = 'sample-workplace-wellbeing-v1'
    AND is_active = true
  LIMIT 1;

  IF v_template_id IS NOT NULL THEN
    INSERT INTO public.assessment_campaigns (
      workspace_id, team_id, template_id, title, description, status, starts_at, due_date, created_by
    ) VALUES (
      v_ws.id,
      v_team.id,
      v_template_id,
      'การสำรวจสมดุลการทำงานประจำรอบเริ่มต้น',
      'สำรวจสุขภาวะและภาระงานเบื้องต้นของสมาชิกในทีม (ใช้เวลาประมาณ 3 นาที)',
      'active',
      v_today,
      v_today + 14,
      v_uid
    );
  END IF;

  v_inv_token := 'BU-' || upper(encode(extensions.gen_random_bytes(8), 'hex'));
  v_inv_hash := encode(extensions.digest(v_inv_token, 'sha256'), 'hex');

  INSERT INTO public.invitations (
    workspace_id, team_id, invited_email, assigned_role, token, token_hash,
    status, max_uses, use_count, expires_at, created_by
  ) VALUES (
    v_ws.id, v_team.id, NULL, 'member', v_inv_token, v_inv_hash,
    'pending', 50, 0, now() + interval '14 days', v_uid
  );

  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_ws.id,
    v_uid,
    'workspace.created',
    'workspace',
    v_ws.id::text,
    jsonb_build_object('team_id', v_team.id, 'team_name', v_team.name)
  );

  RETURN jsonb_build_object(
    'workspace_id', v_ws.id,
    'workspace_name', v_ws.name,
    'team_id', v_team.id,
    'team_name', v_team.name,
    'invite_token', v_inv_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.impl_create_team_in_workspace(
  p_workspace_id uuid,
  p_name text,
  p_description text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  v_team public.teams%rowtype;
  v_template_id uuid;
  v_inv_token text;
  v_inv_hash text;
BEGIN
  IF v_uid IS NULL OR NOT private.is_workspace_leader(p_workspace_id) THEN
    RAISE EXCEPTION 'เฉพาะผู้ดูแลหรือหัวหน้าทีมในพื้นที่ทำงานนี้เท่านั้นที่สามารถสร้างทีมได้' USING ERRCODE = '42501';
  END IF;

  IF char_length(trim(coalesce(p_name, ''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'ชื่อทีมต้องมีอย่างน้อย 1 และไม่เกิน 120 ตัวอักษร' USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(coalesce(p_description, ''))) > 400 THEN
    RAISE EXCEPTION 'คำอธิบายทีมต้องไม่เกิน 400 ตัวอักษร' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.teams (workspace_id, name, description, created_by)
  VALUES (p_workspace_id, trim(p_name), trim(coalesce(p_description, '')), v_uid)
  RETURNING * INTO v_team;

  INSERT INTO public.team_members (workspace_id, team_id, user_id, role)
  VALUES (p_workspace_id, v_team.id, v_uid, 'leader')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  SELECT id INTO v_template_id
  FROM public.assessment_templates
  WHERE slug = 'sample-workplace-wellbeing-v1'
    AND is_active = true
  LIMIT 1;

  IF v_template_id IS NOT NULL THEN
    INSERT INTO public.assessment_campaigns (
      workspace_id, team_id, template_id, title, description, status, starts_at, due_date, created_by
    ) VALUES (
      p_workspace_id,
      v_team.id,
      v_template_id,
      left('แบบสำรวจสมดุลการทำงานประจำเดือน · ' || v_team.name, 160),
      'สำรวจสุขภาวะและภาระงานเบื้องต้นของสมาชิกในทีม',
      'active',
      v_today,
      v_today + 14,
      v_uid
    );
  END IF;

  v_inv_token := 'BU-' || upper(encode(extensions.gen_random_bytes(8), 'hex'));
  v_inv_hash := encode(extensions.digest(v_inv_token, 'sha256'), 'hex');

  INSERT INTO public.invitations (
    workspace_id, team_id, invited_email, assigned_role, token, token_hash,
    status, max_uses, use_count, expires_at, created_by
  ) VALUES (
    p_workspace_id, v_team.id, NULL, 'member', v_inv_token, v_inv_hash,
    'pending', 50, 0, now() + interval '14 days', v_uid
  );

  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_workspace_id, v_uid, 'team.created', 'team', v_team.id::text, jsonb_build_object('name', v_team.name));

  RETURN jsonb_build_object(
    'team_id', v_team.id,
    'name', v_team.name,
    'description', v_team.description,
    'invite_token', v_inv_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.impl_create_team_invitation(
  p_workspace_id uuid,
  p_team_id uuid,
  p_invited_email text DEFAULT NULL,
  p_assigned_role text DEFAULT 'member',
  p_max_uses integer DEFAULT 25,
  p_expires_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_clean_email text := nullif(lower(trim(coalesce(p_invited_email, ''))), '');
  v_token text;
  v_token_hash text;
  v_inv public.invitations%rowtype;
BEGIN
  IF v_uid IS NULL OR NOT private.can_manage_team(p_workspace_id, p_team_id) THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์สร้างคำเชิญสำหรับทีมนี้' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = p_team_id
      AND t.workspace_id = p_workspace_id
      AND t.is_archived = false
  ) THEN
    RAISE EXCEPTION 'ไม่พบทีมนี้ในพื้นที่ทำงานที่เลือก' USING ERRCODE = 'P0002';
  END IF;

  IF p_assigned_role NOT IN ('leader', 'member') THEN
    RAISE EXCEPTION 'บทบาทไม่ถูกต้อง' USING ERRCODE = '22023';
  END IF;

  IF v_clean_email IS NOT NULL AND (
    char_length(v_clean_email) > 254
    OR v_clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ) THEN
    RAISE EXCEPTION 'รูปแบบอีเมลผู้รับคำเชิญไม่ถูกต้อง' USING ERRCODE = '22023';
  END IF;

  v_token := 'BU-' || upper(encode(extensions.gen_random_bytes(8), 'hex'));
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.invitations (
    workspace_id,
    team_id,
    invited_email,
    assigned_role,
    token,
    token_hash,
    status,
    max_uses,
    use_count,
    expires_at,
    created_by
  ) VALUES (
    p_workspace_id,
    p_team_id,
    v_clean_email,
    p_assigned_role,
    v_token,
    v_token_hash,
    'pending',
    CASE WHEN v_clean_email IS NOT NULL THEN 1 ELSE least(greatest(coalesce(p_max_uses, 25), 1), 500) END,
    0,
    now() + make_interval(days => least(greatest(coalesce(p_expires_days, 14), 1), 90)),
    v_uid
  )
  RETURNING * INTO v_inv;

  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    p_workspace_id,
    v_uid,
    'invitation.created',
    'invitation',
    v_inv.id::text,
    jsonb_build_object('team_id', p_team_id, 'assigned_role', p_assigned_role, 'email_restricted', v_clean_email IS NOT NULL)
  );

  RETURN to_jsonb(v_inv);
END;
$$;

CREATE OR REPLACE FUNCTION private.impl_revoke_team_invitation(p_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.invitations%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM public.invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบคำเชิญที่ต้องการยกเลิก' USING ERRCODE = 'P0002';
  END IF;

  IF NOT private.can_manage_team(v_inv.workspace_id, v_inv.team_id) THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ยกเลิกคำเชิญนี้' USING ERRCODE = '42501';
  END IF;

  UPDATE public.invitations
  SET status = 'revoked'
  WHERE id = v_inv.id
  RETURNING * INTO v_inv;

  INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_inv.workspace_id,
    v_uid,
    'invitation.revoked',
    'invitation',
    v_inv.id::text,
    jsonb_build_object('team_id', v_inv.team_id)
  );

  RETURN jsonb_build_object('id', v_inv.id, 'status', v_inv.status);
END;
$$;

REVOKE ALL ON FUNCTION private.impl_revoke_team_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.impl_revoke_team_invitation(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revoke_team_invitation(p_invitation_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.impl_revoke_team_invitation(p_invitation_id);
$$;

REVOKE ALL ON FUNCTION public.revoke_team_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_team_invitation(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.impl_preview_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_email text;
  v_clean_token text := upper(trim(coalesce(p_token, '')));
  v_hash text;
  v_inv public.invitations%rowtype;
  v_ws_name text;
  v_team_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_clean_token) < 6 OR char_length(v_clean_token) > 64 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'รหัสคำเชิญไม่ถูกต้อง');
  END IF;

  v_hash := encode(extensions.digest(v_clean_token, 'sha256'), 'hex');

  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = v_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'ไม่พบรหัสคำเชิญนี้');
  END IF;

  IF v_inv.status <> 'pending' OR v_inv.expires_at <= now() OR v_inv.use_count >= v_inv.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'รหัสคำเชิญนี้หมดอายุหรือถูกใช้งานครบจำนวนแล้ว');
  END IF;

  SELECT lower(trim(email)) INTO v_user_email
  FROM auth.users
  WHERE id = v_uid;

  IF v_inv.invited_email IS NOT NULL AND v_inv.invited_email IS DISTINCT FROM v_user_email THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'คำเชิญนี้ไม่สามารถใช้ได้กับบัญชีอีเมลนี้');
  END IF;

  SELECT name INTO v_ws_name
  FROM public.workspaces
  WHERE id = v_inv.workspace_id;

  SELECT name INTO v_team_name
  FROM public.teams
  WHERE id = v_inv.team_id
    AND workspace_id = v_inv.workspace_id
    AND is_archived = false;

  IF v_ws_name IS NULL OR v_team_name IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'ไม่พบพื้นที่ทำงานหรือทีมของคำเชิญนี้');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'workspace_name', v_ws_name,
    'team_name', v_team_name,
    'assigned_role', v_inv.assigned_role,
    'expires_at', v_inv.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.impl_accept_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_email text;
  v_clean_token text := upper(trim(coalesce(p_token, '')));
  v_hash text;
  v_inv public.invitations%rowtype;
  v_ws public.workspaces%rowtype;
  v_team public.teams%rowtype;
  v_existing_team_role text;
  v_already_member boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'กรุณาเข้าสู่ระบบก่อนตอบรับคำเชิญ' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_clean_token) < 6 OR char_length(v_clean_token) > 64 THEN
    RAISE EXCEPTION 'ไม่พบรหัสคำเชิญนี้ กรุณาตรวจสอบรหัสอีกครั้ง' USING ERRCODE = 'P0002';
  END IF;

  PERFORM private.impl_ensure_user_profile(NULL);

  SELECT lower(trim(email)) INTO v_user_email
  FROM auth.users
  WHERE id = v_uid;

  v_hash := encode(extensions.digest(v_clean_token, 'sha256'), 'hex');

  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบรหัสคำเชิญนี้ กรุณาตรวจสอบรหัสอีกครั้ง' USING ERRCODE = 'P0002';
  END IF;

  IF v_inv.status <> 'pending' OR v_inv.expires_at <= now() OR v_inv.use_count >= v_inv.max_uses THEN
    RAISE EXCEPTION 'รหัสคำเชิญนี้หมดอายุหรือถูกใช้งานครบจำนวนแล้ว' USING ERRCODE = 'P0003';
  END IF;

  IF v_inv.invited_email IS NOT NULL AND v_inv.invited_email IS DISTINCT FROM v_user_email THEN
    RAISE EXCEPTION 'คำเชิญนี้ถูกระบุไว้สำหรับบัญชีอีเมลอื่น' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ws
  FROM public.workspaces
  WHERE id = v_inv.workspace_id;

  SELECT * INTO v_team
  FROM public.teams
  WHERE id = v_inv.team_id
    AND workspace_id = v_inv.workspace_id
    AND is_archived = false;

  IF v_ws.id IS NULL OR v_team.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบพื้นที่ทำงานหรือทีมของคำเชิญนี้' USING ERRCODE = 'P0002';
  END IF;

  SELECT tm.role INTO v_existing_team_role
  FROM public.team_members tm
  WHERE tm.workspace_id = v_ws.id
    AND tm.team_id = v_team.id
    AND tm.user_id = v_uid;

  IF v_existing_team_role IS NOT NULL AND (
    v_existing_team_role = 'leader' OR v_inv.assigned_role = 'member'
  ) THEN
    v_already_member := true;
  ELSE
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (v_ws.id, v_uid, 'member')
    ON CONFLICT (workspace_id, user_id) DO NOTHING;

    INSERT INTO public.team_members (workspace_id, team_id, user_id, role)
    VALUES (v_ws.id, v_team.id, v_uid, v_inv.assigned_role)
    ON CONFLICT (team_id, user_id) DO UPDATE
      SET role = CASE
        WHEN public.team_members.role = 'leader' OR EXCLUDED.role = 'leader' THEN 'leader'
        ELSE 'member'
      END;

    UPDATE public.invitations
    SET use_count = use_count + 1,
        accepted_by = v_uid,
        status = CASE WHEN use_count + 1 >= max_uses THEN 'accepted' ELSE 'pending' END
    WHERE id = v_inv.id;

    INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_ws.id,
      v_uid,
      'invitation.accepted',
      'team',
      v_team.id::text,
      jsonb_build_object('invitation_id', v_inv.id, 'assigned_role', v_inv.assigned_role)
    );
  END IF;

  RETURN jsonb_build_object(
    'workspace_id', v_ws.id,
    'workspace_name', v_ws.name,
    'team_id', v_team.id,
    'team_name', v_team.name,
    'assigned_role', coalesce(v_existing_team_role, v_inv.assigned_role),
    'already_member', v_already_member
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.impl_submit_burnout_assessment(
  p_workspace_id uuid,
  p_team_id uuid,
  p_campaign_id uuid,
  p_template_id uuid,
  p_answers jsonb,
  p_response_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_resp_id uuid := NULL;
  v_existing_status text;
  v_existing_template uuid;
  v_q RECORD;
  v_raw_ans text;
  v_ans_val smallint;
  v_total_sum numeric := 0;
  v_total_count integer := 0;
  v_energy_sum numeric := 0;
  v_energy_count integer := 0;
  v_workload_sum numeric := 0;
  v_workload_count integer := 0;
  v_engage_sum numeric := 0;
  v_engage_count integer := 0;
  v_overall numeric(4,2);
  v_dim_scores jsonb;
  v_summary_level text;
  v_result public.assessment_results%rowtype;
BEGIN
  IF v_uid IS NULL OR NOT private.is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ส่งแบบประเมินในพื้นที่ทำงานนี้' USING ERRCODE = '42501';
  END IF;

  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'รูปแบบคำตอบแบบประเมินไม่ถูกต้อง' USING ERRCODE = '22023';
  END IF;

  IF p_team_id IS NOT NULL AND NOT private.is_team_member(p_workspace_id, p_team_id) THEN
    RAISE EXCEPTION 'คุณไม่ได้เป็นสมาชิกของทีมที่ระบุ' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.assessment_templates t
    WHERE t.id = p_template_id
      AND t.is_active = true
      AND (t.workspace_id IS NULL OR t.workspace_id = p_workspace_id)
  ) THEN
    RAISE EXCEPTION 'ไม่พบชุดแบบประเมินที่เปิดใช้งานสำหรับพื้นที่ทำงานนี้' USING ERRCODE = 'P0002';
  END IF;

  IF p_campaign_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.assessment_campaigns c
    WHERE c.id = p_campaign_id
      AND c.workspace_id = p_workspace_id
      AND c.status = 'active'
  ) THEN
    RAISE EXCEPTION 'รอบการสำรวจนี้ไม่ถูกต้องหรือปิดรับคำตอบแล้ว' USING ERRCODE = '22023';
  END IF;

  IF p_response_id IS NOT NULL THEN
    SELECT status, template_id INTO v_existing_status, v_existing_template
    FROM public.assessment_responses
    WHERE id = p_response_id
      AND user_id = v_uid
      AND workspace_id = p_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ไม่พบร่างแบบประเมินนี้' USING ERRCODE = 'P0002';
    END IF;

    IF v_existing_status = 'submitted' THEN
      RAISE EXCEPTION 'แบบประเมินนี้ถูกส่งเรียบร้อยแล้ว ไม่สามารถส่งซ้ำได้' USING ERRCODE = '22023';
    END IF;

    IF v_existing_template <> p_template_id THEN
      RAISE EXCEPTION 'ชุดคำถามไม่ตรงกับร่างแบบประเมิน' USING ERRCODE = '22023';
    END IF;

    v_resp_id := p_response_id;
  END IF;

  FOR v_q IN
    SELECT id, question_order, category
    FROM public.assessment_questions
    WHERE template_id = p_template_id
    ORDER BY question_order ASC
  LOOP
    v_raw_ans := coalesce(p_answers ->> v_q.id::text, p_answers ->> v_q.question_order::text);
    IF v_raw_ans IS NULL OR v_raw_ans !~ '^[1-5]$' THEN
      RAISE EXCEPTION 'กรุณาตอบคำถามข้อที่ % ให้ครบถ้วน', v_q.question_order USING ERRCODE = '22023';
    END IF;

    v_ans_val := v_raw_ans::smallint;
    v_total_sum := v_total_sum + v_ans_val;
    v_total_count := v_total_count + 1;

    IF v_q.category = 'energy_exhaustion' THEN
      v_energy_sum := v_energy_sum + v_ans_val;
      v_energy_count := v_energy_count + 1;
    ELSIF v_q.category = 'workload_balance' THEN
      v_workload_sum := v_workload_sum + v_ans_val;
      v_workload_count := v_workload_count + 1;
    ELSIF v_q.category = 'work_engagement' THEN
      v_engage_sum := v_engage_sum + v_ans_val;
      v_engage_count := v_engage_count + 1;
    END IF;
  END LOOP;

  IF v_total_count = 0 THEN
    RAISE EXCEPTION 'ไม่พบชุดคำถามของแบบประเมินนี้' USING ERRCODE = 'P0002';
  END IF;

  IF v_resp_id IS NOT NULL THEN
    UPDATE public.assessment_responses
    SET status = 'submitted',
        team_id = coalesce(p_team_id, team_id),
        campaign_id = coalesce(p_campaign_id, campaign_id),
        current_step = v_total_count,
        submitted_at = now(),
        updated_at = now()
    WHERE id = v_resp_id;
  ELSE
    INSERT INTO public.assessment_responses (
      workspace_id, team_id, campaign_id, template_id, user_id, status, current_step, submitted_at, updated_at
    ) VALUES (
      p_workspace_id, p_team_id, p_campaign_id, p_template_id, v_uid, 'submitted', v_total_count, now(), now()
    )
    RETURNING id INTO v_resp_id;
  END IF;

  FOR v_q IN
    SELECT id, question_order
    FROM public.assessment_questions
    WHERE template_id = p_template_id
    ORDER BY question_order ASC
  LOOP
    v_ans_val := coalesce(p_answers ->> v_q.id::text, p_answers ->> v_q.question_order::text)::smallint;
    INSERT INTO public.assessment_answers (response_id, question_id, user_id, answer_value, updated_at)
    VALUES (v_resp_id, v_q.id, v_uid, v_ans_val, now())
    ON CONFLICT (response_id, question_id) DO UPDATE
      SET answer_value = EXCLUDED.answer_value,
          updated_at = now();
  END LOOP;

  v_overall := round(v_total_sum / v_total_count, 2);

  v_dim_scores := jsonb_build_object(
    'energy_exhaustion', CASE WHEN v_energy_count > 0 THEN round(v_energy_sum / v_energy_count, 2) ELSE 0 END,
    'workload_balance', CASE WHEN v_workload_count > 0 THEN round(v_workload_sum / v_workload_count, 2) ELSE 0 END,
    'work_engagement', CASE WHEN v_engage_count > 0 THEN round(v_engage_sum / v_engage_count, 2) ELSE 0 END
  );

  v_summary_level := CASE
    WHEN v_overall < 2.40 THEN 'balanced'
    WHEN v_overall < 3.50 THEN 'moderate_strain'
    ELSE 'high_strain'
  END;

  INSERT INTO public.assessment_results (
    response_id, workspace_id, team_id, campaign_id, template_id, user_id,
    overall_score, dimension_scores, summary_level
  ) VALUES (
    v_resp_id, p_workspace_id, p_team_id, p_campaign_id, p_template_id, v_uid,
    v_overall, v_dim_scores, v_summary_level
  )
  RETURNING * INTO v_result;

  RETURN to_jsonb(v_result);
END;
$$;

CREATE OR REPLACE FUNCTION private.impl_get_team_wellbeing_insights(
  p_workspace_id uuid,
  p_team_id uuid DEFAULT NULL,
  p_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  v_period_days integer := least(greatest(coalesce(p_days, 14), 7), 90);
  v_start_date date := ((now() AT TIME ZONE 'Asia/Bangkok')::date) - (least(greatest(coalesce(p_days, 14), 7), 90) - 1);
  v_prev_start date := (((now() AT TIME ZONE 'Asia/Bangkok')::date) - (least(greatest(coalesce(p_days, 14), 7), 90) - 1)) - least(greatest(coalesce(p_days, 14), 7), 90);
  v_prev_end date := (((now() AT TIME ZONE 'Asia/Bangkok')::date) - (least(greatest(coalesce(p_days, 14), 7), 90) - 1)) - 1;
  v_start_ts timestamptz := ((((now() AT TIME ZONE 'Asia/Bangkok')::date) - (least(greatest(coalesce(p_days, 14), 7), 90) - 1))::timestamp AT TIME ZONE 'Asia/Bangkok');
  v_prev_start_ts timestamptz := (((((now() AT TIME ZONE 'Asia/Bangkok')::date) - (least(greatest(coalesce(p_days, 14), 7), 90) - 1)) - least(greatest(coalesce(p_days, 14), 7), 90))::timestamp AT TIME ZONE 'Asia/Bangkok');
  v_min_group_size integer := 5;
  v_member_count integer := 0;
  v_today_checkins integer := 0;
  v_period_participants integer := 0;
  v_total_checkins integer := 0;
  v_avg_mood numeric(4,2);
  v_prev_avg_mood numeric(4,2);
  v_mood_dist jsonb;
  v_mood_trend jsonb;
  v_factor_counts jsonb;
  v_assessment_respondents integer := 0;
  v_prev_assessment_respondents integer := 0;
  v_assessment_avg numeric(4,2);
  v_prev_assessment_avg numeric(4,2);
  v_dim_energy numeric(4,2);
  v_dim_workload numeric(4,2);
  v_dim_engage numeric(4,2);
  v_level_dist jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_team_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.teams t WHERE t.id = p_team_id AND t.workspace_id = p_workspace_id
    ) THEN
      RAISE EXCEPTION 'ไม่พบทีมนี้ในพื้นที่ทำงานที่เลือก' USING ERRCODE = 'P0002';
    END IF;

    IF NOT private.can_manage_team(p_workspace_id, p_team_id) THEN
      RAISE EXCEPTION 'เฉพาะหัวหน้าทีมหรือผู้ดูแลเท่านั้นที่สามารถดูข้อมูลสรุประดับทีมได้' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT private.is_workspace_leader(p_workspace_id) THEN
      RAISE EXCEPTION 'เฉพาะผู้ดูแลหรือหัวหน้าทีมเท่านั้นที่สามารถดูข้อมูลสรุปพื้นที่ทำงานได้' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT greatest(5, coalesce(min_group_size, 5))
  INTO v_min_group_size
  FROM public.workspaces
  WHERE id = p_workspace_id;

  IF p_team_id IS NOT NULL THEN
    SELECT count(DISTINCT user_id) INTO v_member_count
    FROM public.team_members
    WHERE workspace_id = p_workspace_id AND team_id = p_team_id;
  ELSE
    SELECT count(DISTINCT user_id) INTO v_member_count
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id;
  END IF;

  WITH scoped_members AS (
    SELECT wm.user_id
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND (
        p_team_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = p_workspace_id AND tm.team_id = p_team_id AND tm.user_id = wm.user_id
        )
      )
  )
  SELECT
    count(DISTINCT CASE WHEN m.entry_date = v_today THEN m.user_id END),
    count(DISTINCT m.user_id),
    count(*),
    round(avg(m.mood_level)::numeric, 2)
  INTO v_today_checkins, v_period_participants, v_total_checkins, v_avg_mood
  FROM public.mood_entries m
  JOIN scoped_members sm ON sm.user_id = m.user_id
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.workspace_id = p_workspace_id
    AND p.consent_mood_sharing = true
    AND m.entry_date BETWEEN v_start_date AND v_today;

  WITH scoped_members AS (
    SELECT wm.user_id
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND (
        p_team_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = p_workspace_id AND tm.team_id = p_team_id AND tm.user_id = wm.user_id
        )
      )
  )
  SELECT round(avg(m.mood_level)::numeric, 2)
  INTO v_prev_avg_mood
  FROM public.mood_entries m
  JOIN scoped_members sm ON sm.user_id = m.user_id
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.workspace_id = p_workspace_id
    AND p.consent_mood_sharing = true
    AND m.entry_date BETWEEN v_prev_start AND v_prev_end;

  WITH scoped_members AS (
    SELECT wm.user_id
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND (
        p_team_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = p_workspace_id AND tm.team_id = p_team_id AND tm.user_id = wm.user_id
        )
      )
  )
  SELECT jsonb_build_object(
    'level_1', count(*) FILTER (WHERE m.mood_level = 1),
    'level_2', count(*) FILTER (WHERE m.mood_level = 2),
    'level_3', count(*) FILTER (WHERE m.mood_level = 3),
    'level_4', count(*) FILTER (WHERE m.mood_level = 4),
    'level_5', count(*) FILTER (WHERE m.mood_level = 5)
  )
  INTO v_mood_dist
  FROM public.mood_entries m
  JOIN scoped_members sm ON sm.user_id = m.user_id
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.workspace_id = p_workspace_id
    AND p.consent_mood_sharing = true
    AND m.entry_date BETWEEN v_start_date AND v_today;

  WITH scoped_members AS (
    SELECT wm.user_id
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND (
        p_team_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = p_workspace_id AND tm.team_id = p_team_id AND tm.user_id = wm.user_id
        )
      )
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'date', d.day::date::text,
      'avg_mood', daily.avg_mood,
      'checkin_count', coalesce(daily.cnt, 0)
    ) ORDER BY d.day ASC
  ), '[]'::jsonb)
  INTO v_mood_trend
  FROM generate_series(v_start_date, v_today, interval '1 day') AS d(day)
  LEFT JOIN (
    SELECT
      m.entry_date,
      round(avg(m.mood_level)::numeric, 2) AS avg_mood,
      count(*) AS cnt
    FROM public.mood_entries m
    JOIN scoped_members sm ON sm.user_id = m.user_id
    JOIN public.profiles p ON p.id = m.user_id
    WHERE m.workspace_id = p_workspace_id
      AND p.consent_mood_sharing = true
      AND m.entry_date BETWEEN v_start_date AND v_today
    GROUP BY m.entry_date
  ) daily ON daily.entry_date = d.day::date;

  WITH scoped_members AS (
    SELECT wm.user_id
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND (
        p_team_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = p_workspace_id AND tm.team_id = p_team_id AND tm.user_id = wm.user_id
        )
      )
  )
  SELECT coalesce(jsonb_object_agg(factor_name, factor_cnt), '{}'::jsonb)
  INTO v_factor_counts
  FROM (
    SELECT unnest(m.factors) AS factor_name, count(*) AS factor_cnt
    FROM public.mood_entries m
    JOIN scoped_members sm ON sm.user_id = m.user_id
    JOIN public.profiles p ON p.id = m.user_id
    WHERE m.workspace_id = p_workspace_id
      AND p.consent_mood_sharing = true
      AND m.entry_date BETWEEN v_start_date AND v_today
    GROUP BY factor_name
  ) f;

  WITH scoped_members AS (
    SELECT wm.user_id
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND (
        p_team_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = p_workspace_id AND tm.team_id = p_team_id AND tm.user_id = wm.user_id
        )
      )
  ),
  latest_per_user AS (
    SELECT DISTINCT ON (ar.user_id)
      ar.user_id,
      ar.overall_score,
      ar.dimension_scores,
      ar.summary_level
    FROM public.assessment_results ar
    JOIN scoped_members sm ON sm.user_id = ar.user_id
    WHERE ar.workspace_id = p_workspace_id
      AND ar.created_at >= v_start_ts
    ORDER BY ar.user_id, ar.created_at DESC
  )
  SELECT
    count(*),
    round(avg(overall_score)::numeric, 2),
    round(avg((dimension_scores ->> 'energy_exhaustion')::numeric), 2),
    round(avg((dimension_scores ->> 'workload_balance')::numeric), 2),
    round(avg((dimension_scores ->> 'work_engagement')::numeric), 2),
    jsonb_build_object(
      'balanced', count(*) FILTER (WHERE summary_level = 'balanced'),
      'moderate_strain', count(*) FILTER (WHERE summary_level = 'moderate_strain'),
      'high_strain', count(*) FILTER (WHERE summary_level = 'high_strain')
    )
  INTO
    v_assessment_respondents,
    v_assessment_avg,
    v_dim_energy,
    v_dim_workload,
    v_dim_engage,
    v_level_dist
  FROM latest_per_user;

  WITH scoped_members AS (
    SELECT wm.user_id
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND (
        p_team_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = p_workspace_id AND tm.team_id = p_team_id AND tm.user_id = wm.user_id
        )
      )
  ),
  prev_latest_per_user AS (
    SELECT DISTINCT ON (ar.user_id)
      ar.user_id,
      ar.overall_score
    FROM public.assessment_results ar
    JOIN scoped_members sm ON sm.user_id = ar.user_id
    WHERE ar.workspace_id = p_workspace_id
      AND ar.created_at >= v_prev_start_ts
      AND ar.created_at < v_start_ts
    ORDER BY ar.user_id, ar.created_at DESC
  )
  SELECT count(*), round(avg(overall_score)::numeric, 2)
  INTO v_prev_assessment_respondents, v_prev_assessment_avg
  FROM prev_latest_per_user;

  RETURN jsonb_build_object(
    'period_days', v_period_days,
    'start_date', v_start_date::text,
    'end_date', v_today::text,
    'member_count', v_member_count,
    'mood', jsonb_build_object(
      'today_checkins', v_today_checkins,
      'period_participants', v_period_participants,
      'total_checkins', v_total_checkins,
      'participation_rate', CASE WHEN v_member_count > 0 THEN least(100.0, round((v_period_participants::numeric / v_member_count) * 100, 1)) ELSE 0 END,
      'avg_mood', v_avg_mood,
      'prev_avg_mood', v_prev_avg_mood,
      'distribution', coalesce(v_mood_dist, '{"level_1":0,"level_2":0,"level_3":0,"level_4":0,"level_5":0}'::jsonb),
      'trend', v_mood_trend,
      'factor_counts', v_factor_counts
    ),
    'assessment', CASE
      WHEN v_assessment_respondents < v_min_group_size THEN
        jsonb_build_object(
          'is_sufficient', false,
          'min_required', v_min_group_size,
          'respondent_count', v_assessment_respondents,
          'member_count', v_member_count,
          'completion_rate', CASE WHEN v_member_count > 0 THEN least(100.0, round((v_assessment_respondents::numeric / v_member_count) * 100, 1)) ELSE 0 END,
          'insufficient_message', 'ข้อมูลยังไม่เพียงพอสำหรับแสดงผล',
          'overall_score', NULL,
          'prev_overall_score', NULL,
          'dimension_scores', NULL,
          'level_distribution', NULL
        )
      ELSE
        jsonb_build_object(
          'is_sufficient', true,
          'min_required', v_min_group_size,
          'respondent_count', v_assessment_respondents,
          'member_count', v_member_count,
          'completion_rate', CASE WHEN v_member_count > 0 THEN least(100.0, round((v_assessment_respondents::numeric / v_member_count) * 100, 1)) ELSE 0 END,
          'insufficient_message', NULL,
          'overall_score', v_assessment_avg,
          'prev_overall_score', CASE WHEN v_prev_assessment_respondents >= v_min_group_size THEN v_prev_assessment_avg ELSE NULL END,
          'dimension_scores', jsonb_build_object(
            'energy_exhaustion', v_dim_energy,
            'workload_balance', v_dim_workload,
            'work_engagement', v_dim_engage
          ),
          'level_distribution', v_level_dist
        )
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.impl_get_workspace_directory(p_workspace_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  avatar_url text,
  workspace_role text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_ws_leader boolean;
BEGIN
  IF v_uid IS NULL OR NOT private.is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  v_is_ws_leader := private.is_workspace_leader(p_workspace_id);

  IF v_is_ws_leader THEN
    RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.avatar_url, wm.role AS workspace_role
    FROM public.workspace_members wm
    JOIN public.profiles p ON p.id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id;
  ELSIF EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.workspace_id = p_workspace_id
      AND tm.user_id = v_uid
      AND tm.role = 'leader'
  ) THEN
    RETURN QUERY
    SELECT DISTINCT p.id, p.full_name, p.email, p.avatar_url, wm.role AS workspace_role
    FROM public.team_members my_tm
    JOIN public.team_members peer_tm
      ON peer_tm.workspace_id = my_tm.workspace_id
     AND peer_tm.team_id = my_tm.team_id
    JOIN public.workspace_members wm
      ON wm.workspace_id = peer_tm.workspace_id
     AND wm.user_id = peer_tm.user_id
    JOIN public.profiles p ON p.id = peer_tm.user_id
    WHERE my_tm.workspace_id = p_workspace_id
      AND my_tm.user_id = v_uid
      AND my_tm.role = 'leader';
  ELSE
    RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.avatar_url, wm.role AS workspace_role
    FROM public.workspace_members wm
    JOIN public.profiles p ON p.id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = v_uid;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.impl_get_workspace_directory(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.impl_get_workspace_directory(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_workspace_directory(p_workspace_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  avatar_url text,
  workspace_role text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM private.impl_get_workspace_directory(p_workspace_id);
$$;

REVOKE ALL ON FUNCTION public.get_workspace_directory(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_directory(uuid) TO authenticated, service_role;
