-- ============================================================================
-- BURNING UPP — RLS POLICIES, SECURE FUNCTIONS & SAMPLE ASSESSMENT SEED
-- ============================================================================

-- 1. Auth User Profile Trigger
CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_full_name text;
BEGIN
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, 'สมาชิกใหม่'), '@', 1)
  );

  INSERT INTO public.profiles (id, email, full_name, consent_mood_sharing, consent_assessment_notice)
  VALUES (new.id, coalesce(new.email, ''), left(v_full_name, 100), true, true)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now();

  INSERT INTO public.consent_records (user_id, consent_type, granted)
  VALUES
    (new.id, 'privacy_notice', true),
    (new.id, 'mood_aggregate_sharing', true);

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION private.handle_new_user();
  END IF;
END $$;

-- ============================================================================
-- 2. PRIVATE SECURITY DEFINER HELPER FUNCTIONS FOR RLS
-- ============================================================================

CREATE OR REPLACE FUNCTION private.is_workspace_member(target_workspace_id uuid)
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
      AND wm.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION private.is_workspace_owner(target_workspace_id uuid)
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
      AND wm.user_id = (SELECT auth.uid())
      AND wm.role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION private.is_workspace_leader(target_workspace_id uuid)
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
      AND wm.user_id = (SELECT auth.uid())
      AND wm.role IN ('owner', 'leader')
  );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_team(target_workspace_id uuid, target_team_id uuid)
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
      AND wm.user_id = (SELECT auth.uid())
      AND wm.role IN ('owner', 'leader')
  ) OR EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.workspace_id = target_workspace_id
      AND tm.team_id = target_team_id
      AND tm.user_id = (SELECT auth.uid())
      AND tm.role = 'leader'
  );
$$;

CREATE OR REPLACE FUNCTION private.shares_workspace_with(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT target_user_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.workspace_members wm1
    JOIN public.workspace_members wm2 ON wm1.workspace_id = wm2.workspace_id
    WHERE wm1.user_id = (SELECT auth.uid())
      AND wm2.user_id = target_user_id
  );
$$;

REVOKE ALL ON FUNCTION private.is_workspace_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_workspace_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_workspace_leader(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_manage_team(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.shares_workspace_with(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.is_workspace_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_workspace_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_workspace_leader(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_manage_team(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.shares_workspace_with(uuid) TO authenticated, service_role;

-- ============================================================================
-- 3. ENABLE RLS & CREATE POLICIES ON ALL PUBLIC TABLES
-- ============================================================================

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
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
  END LOOP;
END $$;

-- 3.1 profiles
CREATE POLICY profiles_select_policy ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT private.shares_workspace_with(id)));

CREATE POLICY profiles_insert_policy ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY profiles_update_policy ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- 3.2 workspaces
CREATE POLICY workspaces_select_policy ON public.workspaces
  FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_member(id)));

CREATE POLICY workspaces_insert_policy ON public.workspaces
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY workspaces_update_policy ON public.workspaces
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_workspace_owner(id)))
  WITH CHECK ((SELECT private.is_workspace_owner(id)));

CREATE POLICY workspaces_delete_policy ON public.workspaces
  FOR DELETE TO authenticated
  USING ((SELECT private.is_workspace_owner(id)));

-- 3.3 workspace_members
CREATE POLICY workspace_members_select_policy ON public.workspace_members
  FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY workspace_members_insert_policy ON public.workspace_members
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_workspace_leader(workspace_id)));

CREATE POLICY workspace_members_update_policy ON public.workspace_members
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_workspace_owner(workspace_id)) AND user_id <> (SELECT auth.uid()))
  WITH CHECK ((SELECT private.is_workspace_owner(workspace_id)) AND user_id <> (SELECT auth.uid()));

CREATE POLICY workspace_members_delete_policy ON public.workspace_members
  FOR DELETE TO authenticated
  USING ((SELECT private.is_workspace_owner(workspace_id)) OR user_id = (SELECT auth.uid()));

-- 3.4 teams
CREATE POLICY teams_select_policy ON public.teams
  FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY teams_insert_policy ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_workspace_leader(workspace_id)));

CREATE POLICY teams_update_policy ON public.teams
  FOR UPDATE TO authenticated
  USING ((SELECT private.can_manage_team(workspace_id, id)))
  WITH CHECK ((SELECT private.can_manage_team(workspace_id, id)));

CREATE POLICY teams_delete_policy ON public.teams
  FOR DELETE TO authenticated
  USING ((SELECT private.is_workspace_owner(workspace_id)));

-- 3.5 team_members
CREATE POLICY team_members_select_policy ON public.team_members
  FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY team_members_insert_policy ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.can_manage_team(workspace_id, team_id)));

CREATE POLICY team_members_update_policy ON public.team_members
  FOR UPDATE TO authenticated
  USING ((SELECT private.can_manage_team(workspace_id, team_id)) AND user_id <> (SELECT auth.uid()))
  WITH CHECK ((SELECT private.can_manage_team(workspace_id, team_id)) AND user_id <> (SELECT auth.uid()));

CREATE POLICY team_members_delete_policy ON public.team_members
  FOR DELETE TO authenticated
  USING ((SELECT private.can_manage_team(workspace_id, team_id)) OR user_id = (SELECT auth.uid()));

-- 3.6 invitations
CREATE POLICY invitations_select_policy ON public.invitations
  FOR SELECT TO authenticated
  USING ((SELECT private.can_manage_team(workspace_id, team_id)));

CREATE POLICY invitations_insert_policy ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.can_manage_team(workspace_id, team_id)) AND created_by = (SELECT auth.uid()));

CREATE POLICY invitations_update_policy ON public.invitations
  FOR UPDATE TO authenticated
  USING ((SELECT private.can_manage_team(workspace_id, team_id)))
  WITH CHECK ((SELECT private.can_manage_team(workspace_id, team_id)));

CREATE POLICY invitations_delete_policy ON public.invitations
  FOR DELETE TO authenticated
  USING ((SELECT private.can_manage_team(workspace_id, team_id)));

-- 3.7 mood_entries (STRICT PRIVACY: Only the owner of the entry can read/write raw mood entries & private notes)
CREATE POLICY mood_entries_select_policy ON public.mood_entries
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY mood_entries_insert_policy ON public.mood_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY mood_entries_update_policy ON public.mood_entries
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT private.is_workspace_member(workspace_id)))
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY mood_entries_delete_policy ON public.mood_entries
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 3.8 assessment_templates
CREATE POLICY assessment_templates_select_policy ON public.assessment_templates
  FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR (SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY assessment_templates_insert_policy ON public.assessment_templates
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IS NOT NULL AND (SELECT private.is_workspace_leader(workspace_id)));

CREATE POLICY assessment_templates_update_policy ON public.assessment_templates
  FOR UPDATE TO authenticated
  USING (workspace_id IS NOT NULL AND (SELECT private.is_workspace_leader(workspace_id)))
  WITH CHECK (workspace_id IS NOT NULL AND (SELECT private.is_workspace_leader(workspace_id)));

-- 3.9 assessment_questions
CREATE POLICY assessment_questions_select_policy ON public.assessment_questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessment_templates t
      WHERE t.id = template_id
        AND (t.workspace_id IS NULL OR (SELECT private.is_workspace_member(t.workspace_id)))
    )
  );

-- 3.10 assessment_campaigns
CREATE POLICY assessment_campaigns_select_policy ON public.assessment_campaigns
  FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY assessment_campaigns_insert_policy ON public.assessment_campaigns
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_workspace_leader(workspace_id)));

CREATE POLICY assessment_campaigns_update_policy ON public.assessment_campaigns
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_workspace_leader(workspace_id)))
  WITH CHECK ((SELECT private.is_workspace_leader(workspace_id)));

CREATE POLICY assessment_campaigns_delete_policy ON public.assessment_campaigns
  FOR DELETE TO authenticated
  USING ((SELECT private.is_workspace_leader(workspace_id)));

-- 3.11 assessment_responses (STRICT PRIVACY: Only respondent can access raw responses)
CREATE POLICY assessment_responses_select_policy ON public.assessment_responses
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY assessment_responses_insert_policy ON public.assessment_responses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY assessment_responses_update_policy ON public.assessment_responses
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT private.is_workspace_member(workspace_id)))
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY assessment_responses_delete_policy ON public.assessment_responses
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 3.12 assessment_answers (STRICT PRIVACY: Only respondent can access individual answers)
CREATE POLICY assessment_answers_select_policy ON public.assessment_answers
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY assessment_answers_insert_policy ON public.assessment_answers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY assessment_answers_update_policy ON public.assessment_answers
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY assessment_answers_delete_policy ON public.assessment_answers
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 3.13 assessment_results (STRICT PRIVACY: Direct SELECT is for the respondent only; leaders get >=5 aggregates via RPC)
CREATE POLICY assessment_results_select_policy ON public.assessment_results
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY assessment_results_insert_policy ON public.assessment_results
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY assessment_results_delete_policy ON public.assessment_results
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 3.14 team_reports
CREATE POLICY team_reports_select_policy ON public.team_reports
  FOR SELECT TO authenticated
  USING (
    (SELECT private.is_workspace_leader(workspace_id))
    OR (team_id IS NOT NULL AND (SELECT private.can_manage_team(workspace_id, team_id)))
  );

CREATE POLICY team_reports_insert_policy ON public.team_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_workspace_leader(workspace_id))
    OR (team_id IS NOT NULL AND (SELECT private.can_manage_team(workspace_id, team_id)))
  );

CREATE POLICY team_reports_update_policy ON public.team_reports
  FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_workspace_leader(workspace_id))
    OR (team_id IS NOT NULL AND (SELECT private.can_manage_team(workspace_id, team_id)))
  )
  WITH CHECK (
    (SELECT private.is_workspace_leader(workspace_id))
    OR (team_id IS NOT NULL AND (SELECT private.can_manage_team(workspace_id, team_id)))
  );

CREATE POLICY team_reports_delete_policy ON public.team_reports
  FOR DELETE TO authenticated
  USING ((SELECT private.is_workspace_leader(workspace_id)));

-- 3.15 follow_ups
CREATE POLICY follow_ups_select_policy ON public.follow_ups
  FOR SELECT TO authenticated
  USING ((SELECT private.can_manage_team(workspace_id, team_id)));

CREATE POLICY follow_ups_insert_policy ON public.follow_ups
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.can_manage_team(workspace_id, team_id)));

CREATE POLICY follow_ups_update_policy ON public.follow_ups
  FOR UPDATE TO authenticated
  USING ((SELECT private.can_manage_team(workspace_id, team_id)))
  WITH CHECK ((SELECT private.can_manage_team(workspace_id, team_id)));

CREATE POLICY follow_ups_delete_policy ON public.follow_ups
  FOR DELETE TO authenticated
  USING ((SELECT private.can_manage_team(workspace_id, team_id)));

-- 3.16 consent_records
CREATE POLICY consent_records_select_policy ON public.consent_records
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY consent_records_insert_policy ON public.consent_records
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- 3.17 audit_logs
CREATE POLICY audit_logs_select_policy ON public.audit_logs
  FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND (SELECT private.is_workspace_owner(workspace_id)));

CREATE POLICY audit_logs_insert_policy ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = (SELECT auth.uid())
    AND (workspace_id IS NULL OR (SELECT private.is_workspace_member(workspace_id)))
  );

-- ============================================================================
-- 4. SEED CLEARLY LABELED SAMPLE ASSESSMENT TEMPLATE
-- ============================================================================

DO $$
DECLARE
  v_template_id uuid;
  v_options jsonb := '[
    {"value": 1, "label": "ไม่เลย หรือแทบไม่เคย"},
    {"value": 2, "label": "นานๆ ครั้ง (เดือนละ 1–2 ครั้ง)"},
    {"value": 3, "label": "บางครั้ง (สัปดาห์ละครั้ง)"},
    {"value": 4, "label": "ค่อนข้างบ่อย (หลายครั้งต่อสัปดาห์)"},
    {"value": 5, "label": "บ่อยมาก หรือเกือบทุกวัน"}
  ]'::jsonb;
BEGIN
  INSERT INTO public.assessment_templates (
    workspace_id,
    slug,
    title,
    description,
    instructions,
    disclaimer,
    estimated_minutes,
    is_sample,
    is_active,
    scoring_config
  ) VALUES (
    NULL,
    'sample-workplace-wellbeing-v1',
    'แบบสำรวจสมดุลการทำงานและสัญญาณความเหนื่อยล้า (ชุดคำถามตัวอย่าง)',
    'สำรวจระดับพลังงาน ความสมดุลของภาระงาน และความผูกพันในการทำงาน เพื่อช่วยให้คุณเข้าใจแนวโน้มสุขภาวะของตนเองและช่วยให้ทีมวางแผนดูแลสนับสนุนได้อย่างเหมาะสม',
    'โปรดเลือกคำตอบที่ตรงกับความรู้สึกหรือประสบการณ์ในการทำงานของคุณในช่วง 2 สัปดาห์ที่ผ่านมามากที่สุด คำตอบรายบุคคลของคุณจะถูกเก็บเป็นความลับ',
    'หมายเหตุสำคัญ: ชุดคำถามนี้เป็นชุดคำถามตัวอย่าง (Sample Questionnaire) เพื่อการสำรวจและสะท้อนสุขภาวะในการทำงานเบื้องต้นเท่านั้น ไม่ใช่แบบทดสอบทางคลินิก และผลลัพธ์ที่ได้ไม่ใช่การวินิจฉัยทางการแพทย์หรือภาวะทางสุขภาพจิต',
    3,
    true,
    true,
    '{
      "scale_min": 1,
      "scale_max": 5,
      "direction": "higher_means_more_strain",
      "bands": [
        {"key": "balanced", "min": 1.0, "max": 2.39, "label": "สมดุลการทำงานอยู่ในเกณฑ์ดี"},
        {"key": "moderate_strain", "min": 2.4, "max": 3.49, "label": "เริ่มมีความเหนื่อยล้าสะสม ควรจัดสรรเวลาพักผ่อน"},
        {"key": "high_strain", "min": 3.5, "max": 5.0, "label": "มีความเหนื่อยล้าสูง ควรปรับสมดุลภาระงานหรือขอรับการสนับสนุน"}
      ]
    }'::jsonb
  )
  ON CONFLICT (slug) DO UPDATE
    SET title = EXCLUDED.title
  RETURNING id INTO v_template_id;

  INSERT INTO public.assessment_questions (template_id, question_order, category, category_label, prompt, options)
  VALUES
    (v_template_id, 1, 'energy_exhaustion', 'พลังงานและความเหนื่อยล้า', 'ฉันรู้สึกเหนื่อยล้าหรือหมดพลังหลังจากสิ้นสุดวันทำงาน', v_options),
    (v_template_id, 2, 'energy_exhaustion', 'พลังงานและความเหนื่อยล้า', 'ฉันรู้สึกว่าตื่นเช้ามาพร้อมกับความอ่อนล้าเมื่อต้องเริ่มวันทำงานใหม่', v_options),
    (v_template_id, 3, 'energy_exhaustion', 'พลังงานและความเหนื่อยล้า', 'การทำงานติดต่อกันทำให้ฉันรู้สึกตึงเครียดและพักผ่อนได้ไม่เต็มที่', v_options),
    (v_template_id, 4, 'workload_balance', 'ภาระงานและเวลาพักผ่อน', 'ฉันรู้สึกว่าปริมาณงานหรือความเร่งด่วนของงานมีมากเกินกว่าเวลาที่มี', v_options),
    (v_template_id, 5, 'workload_balance', 'ภาระงานและเวลาพักผ่อน', 'ฉันสามารถแยกเวลาส่วนตัวหรือเวลาพักผ่อนออกจากเรื่องงานได้ยาก', v_options),
    (v_template_id, 6, 'workload_balance', 'ภาระงานและเวลาพักผ่อน', 'ฉันรู้สึกว่าสภาพแวดล้อมหรือกระบวนการทำงานยังไม่เอื้อต่อการทำงานอย่างราบรื่น', v_options),
    (v_template_id, 7, 'work_engagement', 'แรงจูงใจและความหมายของงาน', 'ฉันรู้สึกห่างเหินหรือมีแรงจูงใจในการทำงานลดลงเมื่อเทียบกับก่อนหน้านี้', v_options),
    (v_template_id, 8, 'work_engagement', 'แรงจูงใจและความหมายของงาน', 'ฉันเริ่มไม่แน่ใจว่างานที่กำลังทำอยู่สร้างคุณค่าหรือความก้าวหน้าอย่างไร', v_options),
    (v_template_id, 9, 'work_engagement', 'แรงจูงใจและความหมายของงาน', 'ฉันรู้สึกไม่มั่นใจในประสิทธิภาพของตนเองเมื่อต้องรับมือกับโจทย์งานใหม่ๆ', v_options)
  ON CONFLICT (template_id, question_order) DO UPDATE
    SET category = EXCLUDED.category,
        category_label = EXCLUDED.category_label,
        prompt = EXCLUDED.prompt,
        options = EXCLUDED.options;
END $$;

-- ============================================================================
-- 5. SECURE ATOMIC APPLICATION RPC FUNCTIONS
-- ============================================================================

-- 5.1 Ensure Profile exists for current authenticated user
CREATE OR REPLACE FUNCTION public.ensure_user_profile(p_full_name text DEFAULT NULL)
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

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (v_uid, coalesce(v_email, ''), left(coalesce(v_meta_name, 'ผู้ใช้งาน'), 100))
  ON CONFLICT (id) DO UPDATE
    SET full_name = CASE
          WHEN p_full_name IS NOT NULL AND char_length(trim(p_full_name)) > 0
          THEN left(trim(p_full_name), 100)
          ELSE public.profiles.full_name
        END,
        updated_at = now()
  RETURNING * INTO v_profile;

  RETURN to_jsonb(v_profile);
END;
$$;

-- 5.2 Create Workspace & First Team (Onboarding Flow 1)
CREATE OR REPLACE FUNCTION public.create_workspace_with_team(
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
  v_ws public.workspaces%rowtype;
  v_team public.teams%rowtype;
  v_template_id uuid;
  v_inv_token text;
  v_inv_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  PERFORM public.ensure_user_profile();

  IF char_length(trim(coalesce(p_workspace_name, ''))) < 1 THEN
    RAISE EXCEPTION 'กรุณาระบุชื่อพื้นที่ทำงาน' USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(coalesce(p_first_team_name, ''))) < 1 THEN
    RAISE EXCEPTION 'กรุณาระบุชื่อทีมแรก' USING ERRCODE = '22023';
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

  -- Create a default active assessment campaign for the workspace using the sample template
  SELECT id INTO v_template_id
  FROM public.assessment_templates
  WHERE slug = 'sample-workplace-wellbeing-v1'
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
      CURRENT_DATE,
      CURRENT_DATE + 14,
      v_uid
    );
  END IF;

  -- Generate an initial open team invitation code so the leader can share it right away
  v_inv_token := 'BU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_inv_hash := md5(v_inv_token || v_ws.id::text);

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

-- 5.3 Create Additional Team in Workspace
CREATE OR REPLACE FUNCTION public.create_team_in_workspace(
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
  v_team public.teams%rowtype;
  v_template_id uuid;
  v_inv_token text;
BEGIN
  IF v_uid IS NULL OR NOT private.is_workspace_leader(p_workspace_id) THEN
    RAISE EXCEPTION 'เฉพาะผู้ดูแลหรือหัวหน้าทีมในพื้นที่ทำงานนี้เท่านั้นที่สามารถสร้างทีมได้' USING ERRCODE = '42501';
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
  LIMIT 1;

  IF v_template_id IS NOT NULL THEN
    INSERT INTO public.assessment_campaigns (
      workspace_id, team_id, template_id, title, description, status, starts_at, due_date, created_by
    ) VALUES (
      p_workspace_id,
      v_team.id,
      v_template_id,
      'แบบสำรวจสมดุลการทำงานประจำเดือน · ' || v_team.name,
      'สำรวจสุขภาวะและภาระงานเบื้องต้นของสมาชิกในทีม',
      'active',
      CURRENT_DATE,
      CURRENT_DATE + 14,
      v_uid
    );
  END IF;

  v_inv_token := 'BU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.invitations (
    workspace_id, team_id, invited_email, assigned_role, token, token_hash,
    status, max_uses, use_count, expires_at, created_by
  ) VALUES (
    p_workspace_id, v_team.id, NULL, 'member', v_inv_token, md5(v_inv_token || p_workspace_id::text),
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

-- 5.4 Create Team Invitation
CREATE OR REPLACE FUNCTION public.create_team_invitation(
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
  v_token text;
  v_inv public.invitations%rowtype;
BEGIN
  IF v_uid IS NULL OR NOT private.can_manage_team(p_workspace_id, p_team_id) THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์สร้างคำเชิญสำหรับทีมนี้' USING ERRCODE = '42501';
  END IF;

  IF p_assigned_role NOT IN ('leader', 'member') THEN
    RAISE EXCEPTION 'บทบาทไม่ถูกต้อง' USING ERRCODE = '22023';
  END IF;

  v_token := 'BU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

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
    nullif(lower(trim(coalesce(p_invited_email, ''))), ''),
    p_assigned_role,
    v_token,
    md5(v_token || p_workspace_id::text || clock_timestamp()::text),
    'pending',
    least(greatest(coalesce(p_max_uses, 25), 1), 500),
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
    jsonb_build_object('team_id', p_team_id, 'assigned_role', p_assigned_role)
  );

  RETURN to_jsonb(v_inv);
END;
$$;

-- 5.5 Accept Invitation (Onboarding Flow 2 & Joining Workspace/Team)
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_email text;
  v_clean_token text := upper(trim(coalesce(p_token, '')));
  v_inv public.invitations%rowtype;
  v_ws public.workspaces%rowtype;
  v_team public.teams%rowtype;
  v_ws_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'กรุณาเข้าสู่ระบบก่อนตอบรับคำเชิญ' USING ERRCODE = '42501';
  END IF;

  PERFORM public.ensure_user_profile();

  SELECT lower(trim(email)) INTO v_user_email
  FROM public.profiles
  WHERE id = v_uid;

  SELECT * INTO v_inv
  FROM public.invitations
  WHERE upper(token) = v_clean_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบรหัสคำเชิญนี้ กรุณาตรวจสอบรหัสอีกครั้ง' USING ERRCODE = 'P0002';
  END IF;

  IF v_inv.status <> 'pending' OR v_inv.expires_at <= now() OR v_inv.use_count >= v_inv.max_uses THEN
    RAISE EXCEPTION 'รหัสคำเชิญนี้หมดอายุหรือถูกใช้งานครบจำนวนแล้ว' USING ERRCODE = 'P0003';
  END IF;

  IF v_inv.invited_email IS NOT NULL AND v_inv.invited_email <> v_user_email THEN
    RAISE EXCEPTION 'คำเชิญนี้ถูกระบุไว้สำหรับอีเมลอื่น (%)' , v_inv.invited_email USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ws FROM public.workspaces WHERE id = v_inv.workspace_id;
  SELECT * INTO v_team FROM public.teams WHERE id = v_inv.team_id AND workspace_id = v_inv.workspace_id;

  IF v_ws.id IS NULL OR v_team.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบพื้นที่ทำงานหรือทีมของคำเชิญนี้' USING ERRCODE = 'P0002';
  END IF;

  v_ws_role := CASE WHEN v_inv.assigned_role = 'leader' THEN 'leader' ELSE 'member' END;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_ws.id, v_uid, v_ws_role)
  ON CONFLICT (workspace_id, user_id) DO UPDATE
    SET role = CASE
      WHEN public.workspace_members.role = 'owner' THEN 'owner'
      WHEN public.workspace_members.role = 'leader' OR EXCLUDED.role = 'leader' THEN 'leader'
      ELSE 'member'
    END;

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

  RETURN jsonb_build_object(
    'workspace_id', v_ws.id,
    'workspace_name', v_ws.name,
    'team_id', v_team.id,
    'team_name', v_team.name,
    'assigned_role', v_inv.assigned_role
  );
END;
$$;

-- 5.6 Submit Burnout Assessment (Atomic Scoring + Privacy Protection)
CREATE OR REPLACE FUNCTION public.submit_burnout_assessment(
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
  v_resp_id uuid := p_response_id;
  v_q RECORD;
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

  IF v_resp_id IS NOT NULL THEN
    UPDATE public.assessment_responses
    SET status = 'submitted',
        submitted_at = now(),
        updated_at = now()
    WHERE id = v_resp_id AND user_id = v_uid AND workspace_id = p_workspace_id
    RETURNING id INTO v_resp_id;
  END IF;

  IF v_resp_id IS NULL THEN
    INSERT INTO public.assessment_responses (
      workspace_id, team_id, campaign_id, template_id, user_id, status, current_step, submitted_at, updated_at
    ) VALUES (
      p_workspace_id, p_team_id, p_campaign_id, p_template_id, v_uid, 'submitted', 9, now(), now()
    )
    RETURNING id INTO v_resp_id;
  END IF;

  FOR v_q IN
    SELECT id, question_order, category
    FROM public.assessment_questions
    WHERE template_id = p_template_id
    ORDER BY question_order ASC
  LOOP
    v_ans_val := coalesce((p_answers ->> v_q.id::text)::smallint, (p_answers ->> v_q.question_order::text)::smallint);
    IF v_ans_val IS NULL OR v_ans_val < 1 OR v_ans_val > 5 THEN
      RAISE EXCEPTION 'กรุณาตอบคำถามข้อที่ % ให้ครบถ้วน', v_q.question_order USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.assessment_answers (response_id, question_id, user_id, answer_value, updated_at)
    VALUES (v_resp_id, v_q.id, v_uid, v_ans_val, now())
    ON CONFLICT (response_id, question_id) DO UPDATE
      SET answer_value = EXCLUDED.answer_value,
          updated_at = now();

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
  ON CONFLICT (response_id) DO UPDATE
    SET overall_score = EXCLUDED.overall_score,
        dimension_scores = EXCLUDED.dimension_scores,
        summary_level = EXCLUDED.summary_level
  RETURNING * INTO v_result;

  RETURN to_jsonb(v_result);
END;
$$;

-- 5.7 Get Team Well-being Insights (Enforces Role Auth & >= 5 Respondent Privacy Safeguard)
CREATE OR REPLACE FUNCTION public.get_team_wellbeing_insights(
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
  v_period_days integer := least(greatest(coalesce(p_days, 14), 7), 90);
  v_start_date date := CURRENT_DATE - (least(greatest(coalesce(p_days, 14), 7), 90) - 1);
  v_prev_start date := v_start_date - least(greatest(coalesce(p_days, 14), 7), 90);
  v_prev_end date := v_start_date - 1;
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

  -- Member count
  IF p_team_id IS NOT NULL THEN
    SELECT count(DISTINCT user_id) INTO v_member_count
    FROM public.team_members
    WHERE workspace_id = p_workspace_id AND team_id = p_team_id;
  ELSE
    SELECT count(DISTINCT user_id) INTO v_member_count
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id;
  END IF;

  -- Mood participation & averages (only from members who consented to mood aggregate sharing; never touches private_note)
  SELECT
    count(DISTINCT CASE WHEN m.entry_date = CURRENT_DATE THEN m.user_id END),
    count(DISTINCT m.user_id),
    count(*),
    round(avg(m.mood_level)::numeric, 2)
  INTO v_today_checkins, v_period_participants, v_total_checkins, v_avg_mood
  FROM public.mood_entries m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.workspace_id = p_workspace_id
    AND p.consent_mood_sharing = true
    AND m.entry_date BETWEEN v_start_date AND CURRENT_DATE
    AND (
      p_team_id IS NULL
      OR m.team_id = p_team_id
      OR EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.workspace_id = p_workspace_id AND tm.team_id = p_team_id AND tm.user_id = m.user_id
      )
    );

  SELECT round(avg(m.mood_level)::numeric, 2)
  INTO v_prev_avg_mood
  FROM public.mood_entries m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.workspace_id = p_workspace_id
    AND p.consent_mood_sharing = true
    AND m.entry_date BETWEEN v_prev_start AND v_prev_end
    AND (
      p_team_id IS NULL
      OR m.team_id = p_team_id
      OR EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.workspace_id = p_workspace_id AND tm.team_id = p_team_id AND tm.user_id = m.user_id
      )
    );

  -- Mood distribution (levels 1 to 5)
  SELECT jsonb_build_object(
    'level_1', count(*) FILTER (WHERE m.mood_level = 1),
    'level_2', count(*) FILTER (WHERE m.mood_level = 2),
    'level_3', count(*) FILTER (WHERE m.mood_level = 3),
    'level_4', count(*) FILTER (WHERE m.mood_level = 4),
    'level_5', count(*) FILTER (WHERE m.mood_level = 5)
  )
  INTO v_mood_dist
  FROM public.mood_entries m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.workspace_id = p_workspace_id
    AND p.consent_mood_sharing = true
    AND m.entry_date BETWEEN v_start_date AND CURRENT_DATE
    AND (
      p_team_id IS NULL
      OR m.team_id = p_team_id
      OR EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.workspace_id = p_workspace_id AND tm.team_id = p_team_id AND tm.user_id = m.user_id
      )
    );

  -- Daily mood trend series (missing days have avg_mood = null, never neutral!)
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'date', d.day::text,
      'avg_mood', daily.avg_mood,
      'checkin_count', coalesce(daily.cnt, 0)
    ) ORDER BY d.day ASC
  ), '[]'::jsonb)
  INTO v_mood_trend
  FROM generate_series(v_start_date, CURRENT_DATE, interval '1 day') AS d(day)
  LEFT JOIN (
    SELECT
      m.entry_date,
      round(avg(m.mood_level)::numeric, 2) AS avg_mood,
      count(*) AS cnt
    FROM public.mood_entries m
    JOIN public.profiles p ON p.id = m.user_id
    WHERE m.workspace_id = p_workspace_id
      AND p.consent_mood_sharing = true
      AND m.entry_date BETWEEN v_start_date AND CURRENT_DATE
      AND (
        p_team_id IS NULL
        OR m.team_id = p_team_id
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = p_workspace_id AND tm.team_id = p_team_id AND tm.user_id = m.user_id
        )
      )
    GROUP BY m.entry_date
  ) daily ON daily.entry_date = d.day::date;

  -- Factor counts (optional context chips)
  SELECT coalesce(jsonb_object_agg(factor_name, factor_cnt), '{}'::jsonb)
  INTO v_factor_counts
  FROM (
    SELECT unnest(m.factors) AS factor_name, count(*) AS factor_cnt
    FROM public.mood_entries m
    JOIN public.profiles p ON p.id = m.user_id
    WHERE m.workspace_id = p_workspace_id
      AND p.consent_mood_sharing = true
      AND m.entry_date BETWEEN v_start_date AND CURRENT_DATE
      AND (
        p_team_id IS NULL
        OR m.team_id = p_team_id
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = p_workspace_id AND tm.team_id = p_team_id AND tm.user_id = m.user_id
        )
      )
    GROUP BY factor_name
  ) f;

  -- Assessment aggregate calculations (using latest result per user in the period)
  WITH latest_per_user AS (
    SELECT DISTINCT ON (ar.user_id)
      ar.user_id,
      ar.overall_score,
      ar.dimension_scores,
      ar.summary_level
    FROM public.assessment_results ar
    WHERE ar.workspace_id = p_workspace_id
      AND ar.created_at >= (v_start_date::timestamptz)
      AND (
        p_team_id IS NULL
        OR ar.team_id = p_team_id
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = p_workspace_id AND tm.team_id = p_team_id AND tm.user_id = ar.user_id
        )
      )
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

  -- Previous period assessment comparison
  WITH prev_latest_per_user AS (
    SELECT DISTINCT ON (ar.user_id)
      ar.user_id,
      ar.overall_score
    FROM public.assessment_results ar
    WHERE ar.workspace_id = p_workspace_id
      AND ar.created_at >= (v_prev_start::timestamptz)
      AND ar.created_at < (v_start_date::timestamptz)
      AND (
        p_team_id IS NULL
        OR ar.team_id = p_team_id
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = p_workspace_id AND tm.team_id = p_team_id AND tm.user_id = ar.user_id
        )
      )
    ORDER BY ar.user_id, ar.created_at DESC
  )
  SELECT count(*), round(avg(overall_score)::numeric, 2)
  INTO v_prev_assessment_respondents, v_prev_assessment_avg
  FROM prev_latest_per_user;

  RETURN jsonb_build_object(
    'period_days', v_period_days,
    'start_date', v_start_date::text,
    'end_date', CURRENT_DATE::text,
    'member_count', v_member_count,
    'mood', jsonb_build_object(
      'today_checkins', v_today_checkins,
      'period_participants', v_period_participants,
      'total_checkins', v_total_checkins,
      'participation_rate', CASE WHEN v_member_count > 0 THEN round((v_period_participants::numeric / v_member_count) * 100, 1) ELSE 0 END,
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
          'completion_rate', CASE WHEN v_member_count > 0 THEN round((v_assessment_respondents::numeric / v_member_count) * 100, 1) ELSE 0 END,
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
          'completion_rate', CASE WHEN v_member_count > 0 THEN round((v_assessment_respondents::numeric / v_member_count) * 100, 1) ELSE 0 END,
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

REVOKE ALL ON FUNCTION public.ensure_user_profile(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_workspace_with_team(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_team_in_workspace(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_team_invitation(uuid, uuid, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_invitation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_burnout_assessment(uuid, uuid, uuid, uuid, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_team_wellbeing_insights(uuid, uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_workspace_with_team(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_team_in_workspace(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_team_invitation(uuid, uuid, text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_burnout_assessment(uuid, uuid, uuid, uuid, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_team_wellbeing_insights(uuid, uuid, integer) TO authenticated, service_role;
