-- ============================================================================
-- BURNING UPP — GREENFIELD SCHEMA MIGRATION
-- Multi-tenant Workplace Mental Well-being & Burnout Monitoring SaaS
-- ============================================================================

-- 1. Move any empty prototype tables/functions to an unexposed archive schema
-- so no prior objects are deleted while keeping `public` 100% clean.
CREATE SCHEMA IF NOT EXISTS legacy;
REVOKE ALL ON SCHEMA legacy FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'organizations', 'workspaces', 'users', 'sessions',
        'password_reset_tokens', 'workspace_members', 'teams',
        'memberships', 'invitations', 'checkins',
        'assessment_templates', 'assessment_questions',
        'assessment_schedules', 'assessments', 'assessment_responses',
        'followups', 'team_reports', 'audit_logs'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA legacy;', r.tablename);
  END LOOP;
END $$;

DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS proc_sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE (n.nspname = 'public' AND p.proname LIKE 'rpc_%')
       OR (n.nspname = 'private' AND p.proname IN ('can_manage_team', 'current_app_user_id', 'current_user_org_id', 'is_org_owner', 'is_team_member'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET SCHEMA legacy;', f.proc_sig);
  END LOOP;
END $$;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- ============================================================================
-- 2. IDENTITY & WORKSPACE TABLES
-- ============================================================================

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL CHECK (char_length(trim(full_name)) BETWEEN 1 AND 100),
  avatar_url text,
  preferred_language text NOT NULL DEFAULT 'th' CHECK (preferred_language IN ('th', 'en')),
  consent_mood_sharing boolean NOT NULL DEFAULT true,
  consent_assessment_notice boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  organization_name text CHECK (organization_name IS NULL OR char_length(trim(organization_name)) <= 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  min_group_size integer NOT NULL DEFAULT 5 CHECK (min_group_size BETWEEN 5 AND 50),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspaces_created_by_idx ON public.workspaces (created_by);

CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'leader', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX workspace_members_user_id_idx ON public.workspace_members (user_id);

CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 400),
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);
CREATE INDEX teams_created_by_idx ON public.teams (created_by);

CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  team_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id),
  CONSTRAINT team_members_ws_team_fkey FOREIGN KEY (workspace_id, team_id)
    REFERENCES public.teams(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX team_members_ws_team_idx ON public.team_members (workspace_id, team_id);
CREATE INDEX team_members_user_id_idx ON public.team_members (user_id);

CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  team_id uuid NOT NULL,
  invited_email text CHECK (invited_email IS NULL OR invited_email = lower(trim(invited_email))),
  assigned_role text NOT NULL DEFAULT 'member' CHECK (assigned_role IN ('leader', 'member')),
  token text NOT NULL UNIQUE CHECK (char_length(token) >= 8),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  max_uses integer NOT NULL DEFAULT 25 CHECK (max_uses BETWEEN 1 AND 500),
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  accepted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_ws_team_fkey FOREIGN KEY (workspace_id, team_id)
    REFERENCES public.teams(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX invitations_ws_team_idx ON public.invitations (workspace_id, team_id);
CREATE INDEX invitations_team_id_idx ON public.invitations (team_id);
CREATE INDEX invitations_created_by_idx ON public.invitations (created_by);
CREATE INDEX invitations_accepted_by_idx ON public.invitations (accepted_by);

-- ============================================================================
-- 3. DAILY MOOD TRACKING
-- ============================================================================

CREATE TABLE public.mood_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  mood_level smallint NOT NULL CHECK (mood_level BETWEEN 1 AND 5),
  workload_level smallint CHECK (workload_level IS NULL OR workload_level BETWEEN 1 AND 5),
  sleep_level smallint CHECK (sleep_level IS NULL OR sleep_level BETWEEN 1 AND 5),
  rest_level smallint CHECK (rest_level IS NULL OR rest_level BETWEEN 1 AND 5),
  environment_level smallint CHECK (environment_level IS NULL OR environment_level BETWEEN 1 AND 5),
  personal_level smallint CHECK (personal_level IS NULL OR personal_level BETWEEN 1 AND 5),
  factors text[] NOT NULL DEFAULT '{}',
  private_note text NOT NULL DEFAULT '' CHECK (char_length(private_note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id, entry_date)
);
CREATE INDEX mood_entries_user_id_date_idx ON public.mood_entries (user_id, entry_date DESC);
CREATE INDEX mood_entries_team_id_date_idx ON public.mood_entries (team_id, entry_date DESC);
CREATE INDEX mood_entries_workspace_date_idx ON public.mood_entries (workspace_id, entry_date DESC);

-- ============================================================================
-- 4. PERIODIC BURNOUT ASSESSMENT
-- ============================================================================

CREATE TABLE public.assessment_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  disclaimer text NOT NULL,
  estimated_minutes smallint NOT NULL DEFAULT 3 CHECK (estimated_minutes BETWEEN 1 AND 60),
  is_sample boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  scoring_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assessment_templates_workspace_id_idx ON public.assessment_templates (workspace_id);

CREATE TABLE public.assessment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.assessment_templates(id) ON DELETE CASCADE,
  question_order smallint NOT NULL CHECK (question_order >= 1),
  category text NOT NULL CHECK (category IN ('energy_exhaustion', 'work_engagement', 'workload_balance')),
  category_label text NOT NULL,
  prompt text NOT NULL CHECK (char_length(trim(prompt)) BETWEEN 1 AND 500),
  options jsonb NOT NULL,
  UNIQUE (template_id, question_order)
);

CREATE TABLE public.assessment_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.assessment_templates(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  starts_at date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assessment_campaigns_workspace_id_idx ON public.assessment_campaigns (workspace_id);
CREATE INDEX assessment_campaigns_team_id_idx ON public.assessment_campaigns (team_id);
CREATE INDEX assessment_campaigns_template_id_idx ON public.assessment_campaigns (template_id);
CREATE INDEX assessment_campaigns_created_by_idx ON public.assessment_campaigns (created_by);

CREATE TABLE public.assessment_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.assessment_campaigns(id) ON DELETE SET NULL,
  template_id uuid NOT NULL REFERENCES public.assessment_templates(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted')),
  current_step smallint NOT NULL DEFAULT 1 CHECK (current_step >= 1),
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assessment_responses_workspace_id_idx ON public.assessment_responses (workspace_id);
CREATE INDEX assessment_responses_team_id_idx ON public.assessment_responses (team_id);
CREATE INDEX assessment_responses_campaign_id_idx ON public.assessment_responses (campaign_id);
CREATE INDEX assessment_responses_template_id_idx ON public.assessment_responses (template_id);
CREATE INDEX assessment_responses_user_id_idx ON public.assessment_responses (user_id);

CREATE TABLE public.assessment_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.assessment_responses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.assessment_questions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  answer_value smallint NOT NULL CHECK (answer_value BETWEEN 1 AND 5),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, question_id)
);
CREATE INDEX assessment_answers_question_id_idx ON public.assessment_answers (question_id);
CREATE INDEX assessment_answers_user_id_idx ON public.assessment_answers (user_id);

CREATE TABLE public.assessment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL UNIQUE REFERENCES public.assessment_responses(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.assessment_campaigns(id) ON DELETE SET NULL,
  template_id uuid NOT NULL REFERENCES public.assessment_templates(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  overall_score numeric(4,2) NOT NULL CHECK (overall_score BETWEEN 1.00 AND 5.00),
  dimension_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_level text NOT NULL CHECK (summary_level IN ('balanced', 'moderate_strain', 'high_strain')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assessment_results_workspace_id_idx ON public.assessment_results (workspace_id);
CREATE INDEX assessment_results_team_id_idx ON public.assessment_results (team_id);
CREATE INDEX assessment_results_campaign_id_idx ON public.assessment_results (campaign_id);
CREATE INDEX assessment_results_template_id_idx ON public.assessment_results (template_id);
CREATE INDEX assessment_results_user_id_idx ON public.assessment_results (user_id);

-- ============================================================================
-- 5. REPORTING, FOLLOW-UPS & PRIVACY
-- ============================================================================

CREATE TABLE public.team_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  period_start date NOT NULL,
  period_end date NOT NULL,
  report_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  observations text NOT NULL DEFAULT '' CHECK (char_length(observations) <= 2000),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_reports_workspace_id_idx ON public.team_reports (workspace_id);
CREATE INDEX team_reports_team_id_idx ON public.team_reports (team_id);
CREATE INDEX team_reports_created_by_idx ON public.team_reports (created_by);

CREATE TABLE public.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX follow_ups_workspace_id_idx ON public.follow_ups (workspace_id);
CREATE INDEX follow_ups_team_id_idx ON public.follow_ups (team_id);
CREATE INDEX follow_ups_created_by_idx ON public.follow_ups (created_by);

CREATE TABLE public.consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  consent_type text NOT NULL CHECK (consent_type IN ('privacy_notice', 'mood_aggregate_sharing', 'assessment_participation')),
  granted boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consent_records_user_id_idx ON public.consent_records (user_id);
CREATE INDEX consent_records_workspace_id_idx ON public.consent_records (workspace_id);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (char_length(trim(action)) BETWEEN 1 AND 120),
  entity_type text NOT NULL CHECK (char_length(trim(entity_type)) BETWEEN 1 AND 80),
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_workspace_id_idx ON public.audit_logs (workspace_id);
CREATE INDEX audit_logs_actor_id_idx ON public.audit_logs (actor_id);
