import { describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { INSUFFICIENT_DATA_MESSAGE } from '@/lib/constants';
import type { TeamWellbeingInsights } from '@/types/database';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://rsxrhfbirrqpspesxrlt.supabase.co';
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_tZR62PM3muVJXoavtaWU6Q_0Foi_ATx';

function createIsolatedClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function registerTestUser(
  label: string
): Promise<{ client: SupabaseClient; userId: string; email: string }> {
  const client = createIsolatedClient();
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const email = `qa_${label}_${uniqueSuffix}@burningupp.test`;
  const password = 'QaTestPassword!2026';

  const { data: signUpData, error: signUpError } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: `QA ${label}` },
    },
  });

  if (signUpError) {
    throw new Error(`SignUp failed for ${label}: ${signUpError.message}`);
  }

  if (!signUpData.session) {
    const { error: signInErr } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr) {
      throw new Error(`SignIn failed for ${label}: ${signInErr.message}`);
    }
  }

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    throw new Error(`User missing after auth for ${label}`);
  }

  return { client, userId: user.id, email };
}

describe('Burning Upp — Live Supabase Multi-Tenant, Role Permissions & Privacy QA Suite', () => {
  it('enforces multi-tenant isolation, role permissions, private note protection, and >=5 assessment privacy rules', async () => {
    // 1. Register leaders for Workspace Alpha & Workspace Beta, plus members for Workspace Alpha
    const leaderAlpha = await registerTestUser('leader_alpha');
    const leaderBeta = await registerTestUser('leader_beta');
    const member1 = await registerTestUser('member_alpha_1');
    const member2 = await registerTestUser('member_alpha_2');
    const member3 = await registerTestUser('member_alpha_3');
    const member4 = await registerTestUser('member_alpha_4');

    let wsAlphaId = '';
    let wsBetaId = '';

    try {
      // 2. Create Workspace Alpha & Workspace Beta
      const { data: alphaData, error: alphaErr } = await leaderAlpha.client.rpc(
        'create_workspace_with_team',
        {
          p_workspace_name: 'QA Workspace Alpha',
          p_first_team_name: 'Team Alpha One',
          p_organization_name: 'Alpha Org',
        }
      );
      expect(alphaErr).toBeNull();
      expect(alphaData).toBeTruthy();
      wsAlphaId = alphaData.workspace_id;
      const teamAlphaId: string = alphaData.team_id;
      const inviteTokenAlpha: string = alphaData.invite_token;

      const { data: betaData, error: betaErr } = await leaderBeta.client.rpc(
        'create_workspace_with_team',
        {
          p_workspace_name: 'QA Workspace Beta',
          p_first_team_name: 'Team Beta One',
          p_organization_name: 'Beta Org',
        }
      );
      expect(betaErr).toBeNull();
      expect(betaData).toBeTruthy();
      wsBetaId = betaData.workspace_id;

      // 3. MULTI-TENANT ISOLATION: Verify Beta cannot read Alpha's workspace, teams, or insights
      const { data: betaReadsAlphaWs } = await leaderBeta.client
        .from('workspaces')
        .select('*')
        .eq('id', wsAlphaId);
      expect(betaReadsAlphaWs).toEqual([]);

      const { data: betaReadsAlphaTeams } = await leaderBeta.client
        .from('teams')
        .select('*')
        .eq('workspace_id', wsAlphaId);
      expect(betaReadsAlphaTeams).toEqual([]);

      const { error: betaCallsAlphaInsightsErr } = await leaderBeta.client.rpc(
        'get_team_wellbeing_insights',
        {
          p_workspace_id: wsAlphaId,
          p_team_id: teamAlphaId,
          p_days: 14,
        }
      );
      expect(betaCallsAlphaInsightsErr).toBeTruthy();

      // 4. INVITATION WORKFLOW: 4 members join Workspace Alpha / Team Alpha One using invite token
      for (const m of [member1, member2, member3, member4]) {
        const { data: joinedData, error: joinErr } = await m.client.rpc(
          'accept_invitation',
          {
            p_token: inviteTokenAlpha,
          }
        );
        expect(joinErr).toBeNull();
        expect(joinedData.workspace_id).toBe(wsAlphaId);
        expect(joinedData.team_id).toBe(teamAlphaId);
      }

      // 5. ROLE PERMISSIONS: Verify member1 cannot call leader-only insights RPC or escalate own role
      const { error: memberInsightsErr } = await member1.client.rpc(
        'get_team_wellbeing_insights',
        {
          p_workspace_id: wsAlphaId,
          p_team_id: teamAlphaId,
          p_days: 14,
        }
      );
      expect(memberInsightsErr).toBeTruthy();

      await member1.client
        .from('workspace_members')
        .update({ role: 'owner' })
        .eq('workspace_id', wsAlphaId)
        .eq('user_id', member1.userId);

      const { data: member1RoleCheck } = await member1.client
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', wsAlphaId)
        .eq('user_id', member1.userId)
        .single();
      expect(member1RoleCheck?.role).toBe('member');

      // 6. MOOD TRACKING & PRIVACY: Member 1 & Member 2 submit daily mood check-ins with private notes
      const todayIso = new Date().toISOString().slice(0, 10);
      const secretNote = 'SECRET_PRIVATE_NOTE_DO_NOT_EXPOSE_TO_LEADER';

      const { error: mood1Err } = await member1.client
        .from('mood_entries')
        .insert({
          workspace_id: wsAlphaId,
          team_id: teamAlphaId,
          user_id: member1.userId,
          entry_date: todayIso,
          mood_level: 4,
          factors: ['workload', 'sleep'],
          private_note: secretNote,
        });
      expect(mood1Err).toBeNull();

      const { error: mood2Err } = await member2.client
        .from('mood_entries')
        .insert({
          workspace_id: wsAlphaId,
          team_id: teamAlphaId,
          user_id: member2.userId,
          entry_date: todayIso,
          mood_level: 2,
          factors: ['workload'],
          private_note: 'อีกหนึ่งบันทึกส่วนตัว',
        });
      expect(mood2Err).toBeNull();

      // Member 1 can read their own mood history & private note
      const { data: m1MoodHistory } = await member1.client
        .from('mood_entries')
        .select('*')
        .eq('workspace_id', wsAlphaId);
      expect(m1MoodHistory?.length).toBe(1);
      expect(m1MoodHistory?.[0]?.private_note).toBe(secretNote);

      // PRIVACY CHECK: Leader Alpha CANNOT read member1's mood_entries rows or private_note!
      const { data: leaderReadsMoodRows } = await leaderAlpha.client
        .from('mood_entries')
        .select('*')
        .eq('workspace_id', wsAlphaId);
      expect(leaderReadsMoodRows).toEqual([]);

      // 7. PERIODIC BURNOUT ASSESSMENT & MINIMUM GROUP SIZE (>= 5) SAFEGUARD
      const { data: tpl } = await member1.client
        .from('assessment_templates')
        .select('id')
        .eq('slug', 'sample-workplace-wellbeing-v1')
        .single();
      expect(tpl?.id).toBeTruthy();

      const { data: qRows } = await member1.client
        .from('assessment_questions')
        .select('id, question_order')
        .eq('template_id', tpl!.id)
        .order('question_order');
      expect(qRows?.length).toBe(9);

      const sampleAnswers: Record<string, number> = {};
      for (const q of qRows || []) {
        sampleAnswers[q.id] = 3;
      }

      // Initially only 2 members submit assessments (< 5 threshold)
      for (const m of [member1, member2]) {
        const { error: subErr } = await m.client.rpc(
          'submit_burnout_assessment',
          {
            p_workspace_id: wsAlphaId,
            p_team_id: teamAlphaId,
            p_campaign_id: null,
            p_template_id: tpl!.id,
            p_answers: sampleAnswers,
          }
        );
        expect(subErr).toBeNull();
      }

      // PRIVACY CHECK: Leader Alpha CANNOT read raw assessment_responses, assessment_answers, or assessment_results!
      const { data: leaderRawResponses } = await leaderAlpha.client
        .from('assessment_responses')
        .select('*')
        .eq('workspace_id', wsAlphaId);
      expect(leaderRawResponses).toEqual([]);

      const { data: leaderRawResults } = await leaderAlpha.client
        .from('assessment_results')
        .select('*')
        .eq('workspace_id', wsAlphaId);
      expect(leaderRawResults).toEqual([]);

      // Check Leader Insights when only 2 respondents (< 5): MUST hide aggregate assessment scores!
      const { data: insightsUnder5Raw, error: insUnder5Err } =
        await leaderAlpha.client.rpc('get_team_wellbeing_insights', {
          p_workspace_id: wsAlphaId,
          p_team_id: teamAlphaId,
          p_days: 14,
        });
      expect(insUnder5Err).toBeNull();
      const insightsUnder5 =
        insightsUnder5Raw as unknown as TeamWellbeingInsights;
      expect(insightsUnder5.member_count).toBe(5); // 1 leader + 4 members
      expect(insightsUnder5.mood.avg_mood).toBe(3); // avg of 4 and 2
      expect(insightsUnder5.assessment.respondent_count).toBe(2);
      expect(insightsUnder5.assessment.is_sufficient).toBe(false);
      expect(insightsUnder5.assessment.insufficient_message).toBe(
        INSUFFICIENT_DATA_MESSAGE
      );
      expect(insightsUnder5.assessment.overall_score).toBeNull();
      expect(insightsUnder5.assessment.dimension_scores).toBeNull();

      // Now remaining 3 members (member3, member4, leaderAlpha) submit assessments -> total 5 respondents!
      for (const m of [member3, member4, leaderAlpha]) {
        const { error: subErr } = await m.client.rpc(
          'submit_burnout_assessment',
          {
            p_workspace_id: wsAlphaId,
            p_team_id: teamAlphaId,
            p_campaign_id: null,
            p_template_id: tpl!.id,
            p_answers: sampleAnswers,
          }
        );
        expect(subErr).toBeNull();
      }

      // Check Leader Insights when 5 respondents (>= 5): MUST return aggregate assessment summary!
      const { data: insightsAt5Raw, error: insAt5Err } =
        await leaderAlpha.client.rpc('get_team_wellbeing_insights', {
          p_workspace_id: wsAlphaId,
          p_team_id: teamAlphaId,
          p_days: 14,
        });
      expect(insAt5Err).toBeNull();
      const insightsAt5 = insightsAt5Raw as unknown as TeamWellbeingInsights;
      expect(insightsAt5.assessment.respondent_count).toBe(5);
      expect(insightsAt5.assessment.is_sufficient).toBe(true);
      expect(insightsAt5.assessment.insufficient_message).toBeNull();
      expect(insightsAt5.assessment.overall_score).toBe(3);
      expect(insightsAt5.assessment.dimension_scores?.energy_exhaustion).toBe(
        3
      );
    } finally {
      // Clean up temporary test workspaces so no test data remains in production tables
      if (wsAlphaId) {
        await leaderAlpha.client
          .from('workspaces')
          .delete()
          .eq('id', wsAlphaId);
      }
      if (wsBetaId) {
        await leaderBeta.client.from('workspaces').delete().eq('id', wsBetaId);
      }
    }
  });
});
