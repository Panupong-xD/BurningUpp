-- ============================================================================
-- BURNING UPP — MOVE SECURITY DEFINER IMPLEMENTATIONS TO PRIVATE SCHEMA
-- AND MAKE PUBLIC RPC ENTRYPOINTS SECURITY INVOKER
-- ============================================================================

-- Move the 7 public SECURITY DEFINER implementations into `private` schema
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
  v_inv public.invitations%rowtype;
  v_ws public.workspaces%rowtype;
  v_team public.teams%rowtype;
  v_ws_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'กรุณาเข้าสู่ระบบก่อนตอบรับคำเชิญ' USING ERRCODE = '42501';
  END IF;

  PERFORM private.impl_ensure_user_profile(NULL);

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

  IF p_team_id IS NOT NULL THEN
    SELECT count(DISTINCT user_id) INTO v_member_count
    FROM public.team_members
    WHERE workspace_id = p_workspace_id AND team_id = p_team_id;
  ELSE
    SELECT count(DISTINCT user_id) INTO v_member_count
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id;
  END IF;

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

REVOKE ALL ON FUNCTION private.impl_ensure_user_profile(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.impl_create_workspace_with_team(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.impl_create_team_in_workspace(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.impl_create_team_invitation(uuid, uuid, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.impl_accept_invitation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.impl_submit_burnout_assessment(uuid, uuid, uuid, uuid, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.impl_get_team_wellbeing_insights(uuid, uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.impl_ensure_user_profile(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.impl_create_workspace_with_team(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.impl_create_team_in_workspace(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.impl_create_team_invitation(uuid, uuid, text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.impl_accept_invitation(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.impl_submit_burnout_assessment(uuid, uuid, uuid, uuid, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.impl_get_team_wellbeing_insights(uuid, uuid, integer) TO authenticated, service_role;

-- Switch public RPC entrypoints to SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.ensure_user_profile(p_full_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.impl_ensure_user_profile(p_full_name);
$$;

CREATE OR REPLACE FUNCTION public.create_workspace_with_team(
  p_workspace_name text,
  p_first_team_name text,
  p_organization_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.impl_create_workspace_with_team(p_workspace_name, p_first_team_name, p_organization_name);
$$;

CREATE OR REPLACE FUNCTION public.create_team_in_workspace(
  p_workspace_id uuid,
  p_name text,
  p_description text DEFAULT ''
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.impl_create_team_in_workspace(p_workspace_id, p_name, p_description);
$$;

CREATE OR REPLACE FUNCTION public.create_team_invitation(
  p_workspace_id uuid,
  p_team_id uuid,
  p_invited_email text DEFAULT NULL,
  p_assigned_role text DEFAULT 'member',
  p_max_uses integer DEFAULT 25,
  p_expires_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.impl_create_team_invitation(p_workspace_id, p_team_id, p_invited_email, p_assigned_role, p_max_uses, p_expires_days);
$$;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.impl_accept_invitation(p_token);
$$;

CREATE OR REPLACE FUNCTION public.submit_burnout_assessment(
  p_workspace_id uuid,
  p_team_id uuid,
  p_campaign_id uuid,
  p_template_id uuid,
  p_answers jsonb,
  p_response_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.impl_submit_burnout_assessment(p_workspace_id, p_team_id, p_campaign_id, p_template_id, p_answers, p_response_id);
$$;

CREATE OR REPLACE FUNCTION public.get_team_wellbeing_insights(
  p_workspace_id uuid,
  p_team_id uuid DEFAULT NULL,
  p_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.impl_get_team_wellbeing_insights(p_workspace_id, p_team_id, p_days);
$$;
