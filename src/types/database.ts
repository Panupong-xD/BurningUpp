export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface MoodTrendPoint {
  date: string;
  avg_mood: number | null;
  checkin_count: number;
}

export interface TeamWellbeingInsights {
  period_days: number;
  start_date: string;
  end_date: string;
  member_count: number;
  mood: {
    today_checkins: number;
    period_participants: number;
    total_checkins: number;
    participation_rate: number;
    avg_mood: number | null;
    prev_avg_mood: number | null;
    distribution: {
      level_1: number;
      level_2: number;
      level_3: number;
      level_4: number;
      level_5: number;
    };
    trend: MoodTrendPoint[];
    factor_counts: Record<string, number>;
  };
  assessment: {
    is_sufficient: boolean;
    min_required: number;
    respondent_count: number;
    member_count: number;
    completion_rate: number;
    insufficient_message: string | null;
    overall_score: number | null;
    prev_overall_score: number | null;
    dimension_scores: {
      energy_exhaustion: number;
      workload_balance: number;
      work_engagement: number;
    } | null;
    level_distribution: {
      balanced: number;
      moderate_strain: number;
      high_strain: number;
    } | null;
  };
}

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  preferred_language: 'th' | 'en';
  consent_mood_sharing: boolean;
  consent_assessment_notice: boolean;
  created_at: string;
  updated_at: string;
}

export interface DirectoryMemberRow {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  workspace_role: 'owner' | 'leader' | 'member';
}

export interface WorkspaceRow {
  id: string;
  name: string;
  organization_name: string | null;
  description: string;
  min_group_size: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMemberRow {
  id: string;
  workspace_id: string;
  user_id: string;
  role: 'owner' | 'leader' | 'member';
  joined_at: string;
}

export interface TeamRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMemberRow {
  id: string;
  workspace_id: string;
  team_id: string;
  user_id: string;
  role: 'leader' | 'member';
  joined_at: string;
}

export interface InvitationRow {
  id: string;
  workspace_id: string;
  team_id: string;
  invited_email: string | null;
  assigned_role: 'leader' | 'member';
  token: string;
  token_hash: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  max_uses: number;
  use_count: number;
  expires_at: string;
  created_by: string;
  accepted_by: string | null;
  created_at: string;
}

export interface MoodEntryRow {
  id: string;
  workspace_id: string;
  team_id: string | null;
  user_id: string;
  entry_date: string;
  mood_level: 1 | 2 | 3 | 4 | 5;
  workload_level: number | null;
  sleep_level: number | null;
  rest_level: number | null;
  environment_level: number | null;
  personal_level: number | null;
  factors: string[];
  private_note: string;
  created_at: string;
  updated_at: string;
}

export interface AssessmentTemplateRow {
  id: string;
  workspace_id: string | null;
  slug: string;
  title: string;
  description: string;
  instructions: string;
  disclaimer: string;
  estimated_minutes: number;
  is_sample: boolean;
  is_active: boolean;
  scoring_config: Json;
  created_at: string;
}

export interface AssessmentQuestionOption {
  value: number;
  label: string;
}

export interface AssessmentQuestionRow {
  id: string;
  template_id: string;
  question_order: number;
  category: 'energy_exhaustion' | 'workload_balance' | 'work_engagement';
  category_label: string;
  prompt: string;
  options: AssessmentQuestionOption[];
}

export interface AssessmentCampaignRow {
  id: string;
  workspace_id: string;
  team_id: string | null;
  template_id: string;
  title: string;
  description: string;
  status: 'active' | 'closed';
  starts_at: string;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AssessmentResponseRow {
  id: string;
  workspace_id: string;
  team_id: string | null;
  campaign_id: string | null;
  template_id: string;
  user_id: string;
  status: 'in_progress' | 'submitted';
  current_step: number;
  started_at: string;
  submitted_at: string | null;
  updated_at: string;
}

export interface AssessmentResultRow {
  id: string;
  response_id: string;
  workspace_id: string;
  team_id: string | null;
  campaign_id: string | null;
  template_id: string;
  user_id: string;
  overall_score: number;
  dimension_scores: {
    energy_exhaustion?: number;
    workload_balance?: number;
    work_engagement?: number;
  };
  summary_level: 'balanced' | 'moderate_strain' | 'high_strain';
  created_at: string;
}

export interface TeamReportRow {
  id: string;
  workspace_id: string;
  team_id: string | null;
  title: string;
  period_start: string;
  period_end: string;
  report_data: TeamWellbeingInsights;
  observations: string;
  created_by: string | null;
  created_at: string;
}

export interface FollowUpRow {
  id: string;
  workspace_id: string;
  team_id: string;
  title: string;
  description: string;
  due_date: string | null;
  status: 'open' | 'in_progress' | 'done';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
