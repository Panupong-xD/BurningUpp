import { describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { INSUFFICIENT_DATA_MESSAGE } from '@/lib/constants';
import { getTodayIsoDate } from '@/lib/wellbeing';
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

describe('Burning Upp — Live Supabase Multi-Tenant, Security Hardening & Privacy QA Suite', () => {
  it('enforces multi-tenant isolation, role permissions, private note protection, and >=5 assessment privacy rules', async () => {
    const leaderAlpha = await registerTestUser('leader_alpha');
    const leaderBeta = await registerTestUser('leader_beta');
    const member1 = await registerTestUser('member_alpha_1');
    const member2 = await registerTestUser('member_alpha_2');
    const member3 = await registerTestUser('member_alpha_3');
    const member4 = await registerTestUser('member_alpha_4');

    let wsAlphaId = '';
    let wsBetaId = '';

    try {
      // 1. Anonymous (anon) access MUST be blocked across all sensitive tables
      const anonClient = createIsolatedClient();
      const { error: anonWsErr } = await anonClient.from('workspaces').select('*').limit(1);
      const { error: anonProfErr } = await anonClient.from('profiles').select('*').limit(1);
      const { error: anonMoodErr } = await anonClient.from('mood_entries').select('*').limit(1);
      expect(anonWsErr).toBeTruthy();
      expect(anonProfErr).toBeTruthy();
      expect(anonMoodErr).toBeTruthy();

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
      expect(inviteTokenAlpha).toMatch(/^BU-[0-9A-F]{16}$/);

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

      // 3. MULTI-TENANT ISOLATION
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

      // 4. INVITATION WORKFLOW
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

      // 5. ROLE PERMISSIONS & ANTI-ESCALATION
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

      // 6. MOOD TRACKING, PRIVACY & CONSENT ISOLATION
      const todayIso = getTodayIsoDate();
      const secretNote = 'SECRET_PRIVATE_NOTE_DO_NOT_EXPOSE_TO_LEADER';

      // Invalid factors and future date must be rejected by DB constraints/triggers
      const { error: badFactorErr } = await member1.client
        .from('mood_entries')
        .insert({
          workspace_id: wsAlphaId,
          team_id: teamAlphaId,
          user_id: member1.userId,
          entry_date: todayIso,
          mood_level: 4,
          factors: ['injected_factor'],
        });
      expect(badFactorErr).toBeTruthy();

      const { error: futureDateErr } = await member1.client
        .from('mood_entries')
        .insert({
          workspace_id: wsAlphaId,
          team_id: teamAlphaId,
          user_id: member1.userId,
          entry_date: '2099-01-01',
          mood_level: 4,
        });
      expect(futureDateErr).toBeTruthy();

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

      // Leader CANNOT query other users' profiles rows (prevents reading consent_mood_sharing!)
      const { data: leaderProfiles } = await leaderAlpha.client
        .from('profiles')
        .select('*');
      expect(leaderProfiles?.length).toBe(1);
      expect(leaderProfiles?.[0]?.id).toBe(leaderAlpha.userId);

      // Leader CAN fetch workspace directory via safe RPC (contains NO consent_mood_sharing field!)
      const { data: dirRows, error: dirErr } = await leaderAlpha.client.rpc(
        'get_workspace_directory',
        { p_workspace_id: wsAlphaId }
      );
      expect(dirErr).toBeNull();
      expect(dirRows?.length).toBe(5);
      expect(dirRows?.[0]).not.toHaveProperty('consent_mood_sharing');

      // Member 1 can read own private note, Leader cannot
      const { data: m1MoodHistory } = await member1.client
        .from('mood_entries')
        .select('*')
        .eq('workspace_id', wsAlphaId);
      expect(m1MoodHistory?.length).toBe(1);
      expect(m1MoodHistory?.[0]?.private_note).toBe(secretNote);

      const { data: leaderReadsMoodRows } = await leaderAlpha.client
        .from('mood_entries')
        .select('*')
        .eq('workspace_id', wsAlphaId);
      expect(leaderReadsMoodRows).toEqual([]);

      // 7. ASSESSMENT SECURITY & >=5 THRESHOLD
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

      // Direct client INSERT into assessment_results & audit_logs MUST be blocked
      const { error: directResultErr } = await member1.client
        .from('assessment_results')
        .insert({
          response_id: '00000000-0000-0000-0000-000000000001',
          workspace_id: wsAlphaId,
          team_id: teamAlphaId,
          template_id: tpl!.id,
          user_id: member1.userId,
          overall_score: 5.0,
          summary_level: 'high_strain',
        });
      expect(directResultErr).toBeTruthy();

      const { error: directAuditErr } = await member1.client
        .from('audit_logs')
        .insert({
          workspace_id: wsAlphaId,
          actor_id: member1.userId,
          action: 'forged.event',
          entity_type: 'workspace',
        });
      expect(directAuditErr).toBeTruthy();

      const sampleAnswers: Record<string, number> = {};
      for (const q of qRows || []) {
        sampleAnswers[q.id] = 3;
      }

      // 2 respondents (< 5 threshold)
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

      const { data: insightsUnder5Raw, error: insUnder5Err } =
        await leaderAlpha.client.rpc('get_team_wellbeing_insights', {
          p_workspace_id: wsAlphaId,
          p_team_id: teamAlphaId,
          p_days: 14,
        });
      expect(insUnder5Err).toBeNull();
      const insightsUnder5 = insightsUnder5Raw as unknown as TeamWellbeingInsights;
      expect(insightsUnder5.member_count).toBe(5);
      expect(insightsUnder5.mood.avg_mood).toBe(3);
      expect(insightsUnder5.assessment.respondent_count).toBe(2);
      expect(insightsUnder5.assessment.is_sufficient).toBe(false);
      expect(insightsUnder5.assessment.insufficient_message).toBe(INSUFFICIENT_DATA_MESSAGE);
      expect(insightsUnder5.assessment.overall_score).toBeNull();
      expect(insightsUnder5.assessment.dimension_scores).toBeNull();

      // Remaining 3 submit -> total 5 respondents
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
      expect(insightsAt5.assessment.dimension_scores?.energy_exhaustion).toBe(3);
    } finally {
      if (wsAlphaId) {
        await leaderAlpha.client.from('workspaces').delete().eq('id', wsAlphaId);
      }
      if (wsBetaId) {
        await leaderBeta.client.from('workspaces').delete().eq('id', wsBetaId);
      }
    }
  });

  it('blocks email-spoofing invite bypass, team-to-workspace privilege escalation, owner demotion, and invite DoS', async () => {
    const owner = await registerTestUser('sec_owner');
    const teamLeader = await registerTestUser('sec_team_leader');
    const attacker = await registerTestUser('sec_attacker');

    let wsId = '';

    try {
      const { data: wsData, error: wsErr } = await owner.client.rpc(
        'create_workspace_with_team',
        {
          p_workspace_name: 'Sec Audit Workspace',
          p_first_team_name: 'Team One',
        }
      );
      expect(wsErr).toBeNull();
      wsId = wsData.workspace_id;
      const team1Id: string = wsData.team_id;

      // Create Team Two in same workspace
      const { data: team2Data, error: team2Err } = await owner.client.rpc(
        'create_team_in_workspace',
        {
          p_workspace_id: wsId,
          p_name: 'Team Two',
          p_description: 'Second team',
        }
      );
      expect(team2Err).toBeNull();
      const team2Id: string = team2Data.team_id;

      // 1. EMAIL-RESTRICTED INVITATION + PROFILE EMAIL SPOOFING ATTACK
      const targetEmail = teamLeader.email;
      const { data: restrictedInv, error: invErr } = await owner.client.rpc(
        'create_team_invitation',
        {
          p_workspace_id: wsId,
          p_team_id: team1Id,
          p_invited_email: targetEmail,
          p_assigned_role: 'leader',
          p_max_uses: 5, // should be forced to 1 for email-restricted invite
          p_expires_days: 7,
        }
      );
      expect(invErr).toBeNull();
      expect(restrictedInv.max_uses).toBe(1);

      // Attacker tries to spoof profiles.email to match targetEmail
      await attacker.client
        .from('profiles')
        .update({ email: targetEmail })
        .eq('id', attacker.userId);

      const { data: attackerProf } = await attacker.client
        .from('profiles')
        .select('email')
        .eq('id', attacker.userId)
        .single();
      // Trigger MUST keep real email unchanged
      expect(attackerProf?.email).toBe(attacker.email);

      // Attacker previews restricted invite -> MUST return valid: false and NOT leak targetEmail
      const { data: previewRes } = await attacker.client.rpc('preview_invitation', {
        p_token: restrictedInv.token,
      });
      expect(previewRes.valid).toBe(false);
      expect(JSON.stringify(previewRes)).not.toContain(targetEmail);

      // Attacker tries to accept restricted invite -> MUST fail and NOT leak targetEmail
      const { error: attackerAcceptErr } = await attacker.client.rpc(
        'accept_invitation',
        { p_token: restrictedInv.token }
      );
      expect(attackerAcceptErr).toBeTruthy();
      expect(attackerAcceptErr?.message).not.toContain(targetEmail);

      // Legitimate teamLeader accepts invite
      const { data: leaderJoin, error: leaderJoinErr } = await teamLeader.client.rpc(
        'accept_invitation',
        { p_token: restrictedInv.token }
      );
      expect(leaderJoinErr).toBeNull();
      expect(leaderJoin.team_id).toBe(team1Id);
      expect(leaderJoin.assigned_role).toBe('leader');

      // 2. TEAM LEADER MUST NOT ESCALATE TO WORKSPACE LEADER!
      const { data: tlWsMem } = await teamLeader.client
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', wsId)
        .eq('user_id', teamLeader.userId)
        .single();
      expect(tlWsMem?.role).toBe('member');

      // Team 1 leader CAN view Team 1 insights, CANNOT view workspace-wide or Team 2 insights!
      const { error: tlTeam1Err } = await teamLeader.client.rpc(
        'get_team_wellbeing_insights',
        { p_workspace_id: wsId, p_team_id: team1Id, p_days: 14 }
      );
      expect(tlTeam1Err).toBeNull();

      const { error: tlAllErr } = await teamLeader.client.rpc(
        'get_team_wellbeing_insights',
        { p_workspace_id: wsId, p_team_id: null, p_days: 14 }
      );
      expect(tlAllErr).toBeTruthy();

      const { error: tlTeam2Err } = await teamLeader.client.rpc(
        'get_team_wellbeing_insights',
        { p_workspace_id: wsId, p_team_id: team2Id, p_days: 14 }
      );
      expect(tlTeam2Err).toBeTruthy();

      // Team 1 leader creates a leader invite for Team 1 and accepts it themselves -> STILL workspace 'member' + idempotent use_count!
      const { data: selfInv, error: selfInvErr } = await teamLeader.client.rpc(
        'create_team_invitation',
        {
          p_workspace_id: wsId,
          p_team_id: team1Id,
          p_invited_email: null,
          p_assigned_role: 'leader',
          p_max_uses: 2,
        }
      );
      expect(selfInvErr).toBeNull();

      const { data: selfAccept } = await teamLeader.client.rpc('accept_invitation', {
        p_token: selfInv.token,
      });
      expect(selfAccept.already_member).toBe(true);

      const { data: tlWsMemAfter } = await teamLeader.client
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', wsId)
        .eq('user_id', teamLeader.userId)
        .single();
      expect(tlWsMemAfter?.role).toBe('member');

      // Verify use_count stayed 0 (no invitation DoS!)
      const { data: invCheck } = await teamLeader.client
        .from('invitations')
        .select('use_count')
        .eq('id', selfInv.id)
        .single();
      expect(invCheck?.use_count).toBe(0);

      // 3. TEAM LEADER CANNOT DEMOTE OR REMOVE WORKSPACE OWNER FROM TEAM 1
      await teamLeader.client
        .from('team_members')
        .update({ role: 'member' })
        .eq('workspace_id', wsId)
        .eq('team_id', team1Id)
        .eq('user_id', owner.userId);

      await teamLeader.client
        .from('team_members')
        .delete()
        .eq('workspace_id', wsId)
        .eq('team_id', team1Id)
        .eq('user_id', owner.userId);

      const { data: ownerTeamMem } = await owner.client
        .from('team_members')
        .select('role')
        .eq('workspace_id', wsId)
        .eq('team_id', team1Id)
        .eq('user_id', owner.userId)
        .single();
      expect(ownerTeamMem?.role).toBe('leader');

      // 4. OWNER CANNOT ORPHAN WORKSPACE BY DELETING SELF FROM workspace_members
      await owner.client
        .from('workspace_members')
        .delete()
        .eq('workspace_id', wsId)
        .eq('user_id', owner.userId);

      const { data: ownerWsMem } = await owner.client
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', wsId)
        .eq('user_id', owner.userId)
        .single();
      expect(ownerWsMem?.role).toBe('owner');

      // 5. REVOKE INVITATION RPC WORKS & BLOCKS SUBSEQUENT USE
      const { error: revErr } = await teamLeader.client.rpc('revoke_team_invitation', {
        p_invitation_id: selfInv.id,
      });
      expect(revErr).toBeNull();

      const { error: useRevokedErr } = await attacker.client.rpc('accept_invitation', {
        p_token: selfInv.token,
      });
      expect(useRevokedErr).toBeTruthy();
    } finally {
      if (wsId) {
        await owner.client.from('workspaces').delete().eq('id', wsId);
      }
    }
  });
});
