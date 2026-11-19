'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/ui/Logo';
import { StatusBanner } from '@/components/ui/Surface';
import {
  DailyCheckinView,
  MemberAssessmentsView,
  MemberOverviewView,
  MemberProfileView,
  MoodHistoryView,
  type MemberTab,
} from './MemberViews';
import {
  LeaderAssessmentsView,
  LeaderMoodInsightsView,
  LeaderOverviewView,
  TeamsManagementView,
  type LeaderTab,
} from './LeaderViews';
import { ReportsAndFollowUpView } from './ReportsAndFollowUpView';
import type {
  AssessmentCampaignRow,
  AssessmentQuestionRow,
  AssessmentResponseRow,
  AssessmentResultRow,
  AssessmentTemplateRow,
  DirectoryMemberRow,
  FollowUpRow,
  InvitationRow,
  MoodEntryRow,
  ProfileRow,
  TeamMemberRow,
  TeamReportRow,
  TeamRow,
  TeamWellbeingInsights,
  WorkspaceMemberRow,
  WorkspaceRow,
} from '@/types/database';
import {
  BarChart3,
  CalendarHeart,
  ClipboardCheck,
  FileSpreadsheet,
  HeartPulse,
  LayoutDashboard,
  Loader2,
  LogOut,
  SmilePlus,
  UserCircle,
  Users,
} from 'lucide-react';

export function WorkspaceAppClient({
  userId,
  initialWorkspaces,
  initialWorkspaceMemberships,
}: {
  userId: string;
  initialWorkspaces: WorkspaceRow[];
  initialWorkspaceMemberships: WorkspaceMemberRow[];
}) {
  const router = useRouter();
  const queryWsId = useSearchParams().get('workspace');

  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>(initialWorkspaces);
  const [wsMemberships, setWsMemberships] = useState<WorkspaceMemberRow[]>(initialWorkspaceMemberships);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => {
    if (queryWsId && initialWorkspaces.some((w) => w.id === queryWsId)) return queryWsId;
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('burningupp_active_workspace_id');
      if (saved && initialWorkspaces.some((w) => w.id === saved)) return saved;
    }
    return initialWorkspaces[0]?.id || '';
  });

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [directoryMap, setDirectoryMap] = useState<Record<string, DirectoryMemberRow>>({});
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [moodEntries, setMoodEntries] = useState<MoodEntryRow[]>([]);
  const [template, setTemplate] = useState<AssessmentTemplateRow | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestionRow[]>([]);
  const [campaigns, setCampaigns] = useState<AssessmentCampaignRow[]>([]);
  const [inProgressResponse, setInProgressResponse] = useState<AssessmentResponseRow | null>(null);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, number>>({});
  const [myResults, setMyResults] = useState<AssessmentResultRow[]>([]);
  const [reports, setReports] = useState<TeamReportRow[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState<number>(14);
  const [insights, setInsights] = useState<TeamWellbeingInsights | null>(null);
  const [loadingInsights, setLoadingInsights] = useState<boolean>(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'leader' | 'member'>('member');
  const [leaderTab, setLeaderTab] = useState<LeaderTab>('overview');
  const [memberTab, setMemberTab] = useState<MemberTab>('my-overview');
  const [preselectedMood, setPreselectedMood] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState<boolean>(true);

  const wsLoadSeqRef = useRef(0);
  const insightsLoadSeqRef = useRef(0);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];
  const myWsMembership = wsMemberships.find(
    (m) => m.workspace_id === activeWorkspace?.id && m.user_id === userId
  );
  const isWorkspaceOwner = myWsMembership?.role === 'owner';
  const isWorkspaceLeader =
    myWsMembership?.role === 'owner' || myWsMembership?.role === 'leader';

  const managedTeams = useMemo(() => {
    if (isWorkspaceLeader) return teams;
    return teams.filter((t) =>
      teamMembers.some(
        (tm) => tm.workspace_id === activeWorkspace?.id && tm.team_id === t.id && tm.user_id === userId && tm.role === 'leader'
      )
    );
  }, [isWorkspaceLeader, teams, teamMembers, activeWorkspace?.id, userId]);

  const isLeader = isWorkspaceLeader || managedTeams.length > 0;

  const effectiveTeamId = useMemo(() => {
    if (isWorkspaceLeader) {
      if (selectedTeamId && teams.some((t) => t.id === selectedTeamId)) return selectedTeamId;
      return null;
    }
    if (selectedTeamId && managedTeams.some((t) => t.id === selectedTeamId)) {
      return selectedTeamId;
    }
    return managedTeams[0]?.id ?? null;
  }, [isWorkspaceLeader, selectedTeamId, teams, managedTeams]);

  const loadWorkspaceData = useCallback(async (wsId: string) => {
    if (!wsId) return;
    const seq = ++wsLoadSeqRef.current;
    setLoadingWorkspace(true);
    setWorkspaceError(null);
    try {
      const supabase = createClient();
      const [wsListRes, wsMemRes, profRes, teamsRes, tmRes, moodRes, tplRes, campRes, myResRes, inProgRes] = await Promise.all([
        supabase.from('workspaces').select('*').order('created_at'),
        supabase.from('workspace_members').select('*').eq('user_id', userId),
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('teams').select('*').eq('workspace_id', wsId).eq('is_archived', false).order('created_at'),
        supabase.from('team_members').select('*').eq('workspace_id', wsId),
        supabase.from('mood_entries').select('*').eq('workspace_id', wsId).eq('user_id', userId).order('entry_date', { ascending: false }),
        supabase
          .from('assessment_templates')
          .select('*')
          .eq('is_active', true)
          .or(`workspace_id.is.null,workspace_id.eq.${wsId}`)
          .order('workspace_id', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('assessment_campaigns').select('*').eq('workspace_id', wsId).order('created_at', { ascending: false }),
        supabase.from('assessment_results').select('*').eq('workspace_id', wsId).eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('assessment_responses').select('*').eq('workspace_id', wsId).eq('user_id', userId).eq('status', 'in_progress').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      if (seq !== wsLoadSeqRef.current) return;

      const latestWorkspaces = (wsListRes.data || []) as WorkspaceRow[];
      if (latestWorkspaces.length === 0) {
        router.replace('/onboarding');
        return;
      }
      setWorkspaces(latestWorkspaces);
      if (!latestWorkspaces.some((w) => w.id === wsId)) {
        setActiveWorkspaceId(latestWorkspaces[0].id);
        return;
      }

      if (wsMemRes.data) setWsMemberships(wsMemRes.data as WorkspaceMemberRow[]);
      if (profRes.data) setProfile(profRes.data as ProfileRow);
      if (teamsRes.data) setTeams(teamsRes.data as TeamRow[]);
      if (tmRes.data) setTeamMembers(tmRes.data as TeamMemberRow[]);
      if (moodRes.data) setMoodEntries(moodRes.data as MoodEntryRow[]);
      if (campRes.data) setCampaigns(campRes.data as AssessmentCampaignRow[]);
      if (myResRes.data) setMyResults(myResRes.data as AssessmentResultRow[]);

      const activeTpl = (tplRes.data as AssessmentTemplateRow) || null;
      setTemplate(activeTpl);
      if (activeTpl) {
        const { data: qData } = await supabase
          .from('assessment_questions')
          .select('*')
          .eq('template_id', activeTpl.id)
          .order('question_order', { ascending: true });
        if (seq !== wsLoadSeqRef.current) return;
        setQuestions((qData as AssessmentQuestionRow[]) || []);
      } else {
        setQuestions([]);
      }

      const inProg = (inProgRes.data as AssessmentResponseRow) || null;
      setInProgressResponse(inProg);
      if (inProg) {
        const { data: ansData } = await supabase
          .from('assessment_answers')
          .select('question_id, answer_value')
          .eq('response_id', inProg.id);
        if (seq !== wsLoadSeqRef.current) return;
        const map: Record<string, number> = {};
        for (const row of ansData || []) map[row.question_id] = row.answer_value;
        setDraftAnswers(map);
      } else {
        setDraftAnswers({});
      }

      const wsRole = (wsMemRes.data || []).find((m) => m.workspace_id === wsId)?.role;
      const teamLeader = (tmRes.data || []).some((tm) => tm.user_id === userId && tm.role === 'leader');
      if (wsRole === 'owner' || wsRole === 'leader' || teamLeader) {
        const [invRes, repRes, fuRes, dirRes] = await Promise.all([
          supabase.from('invitations').select('*').eq('workspace_id', wsId).order('created_at', { ascending: false }),
          supabase.from('team_reports').select('*').eq('workspace_id', wsId).order('created_at', { ascending: false }),
          supabase.from('follow_ups').select('*').eq('workspace_id', wsId).order('created_at', { ascending: false }),
          supabase.rpc('get_workspace_directory', { p_workspace_id: wsId }),
        ]);
        if (seq !== wsLoadSeqRef.current) return;
        setInvitations((invRes.data as InvitationRow[]) || []);
        setReports((repRes.data as unknown as TeamReportRow[]) || []);
        setFollowUps((fuRes.data as FollowUpRow[]) || []);
        const dMap: Record<string, DirectoryMemberRow> = {};
        for (const p of (dirRes.data as DirectoryMemberRow[]) || []) dMap[p.id] = p;
        setDirectoryMap(dMap);
      } else {
        setInvitations([]);
        setReports([]);
        setFollowUps([]);
        setDirectoryMap({});
      }
    } catch {
      if (seq === wsLoadSeqRef.current) {
        setWorkspaceError('ไม่สามารถโหลดข้อมูลพื้นที่ทำงานได้ กรุณาลองรีเฟรชหน้าใหม่อีกครั้ง');
      }
    } finally {
      if (seq === wsLoadSeqRef.current) {
        setLoadingWorkspace(false);
      }
    }
  }, [userId, router]);

  useEffect(() => {
    setViewMode(isLeader ? 'leader' : 'member');
  }, [activeWorkspaceId, isLeader]);

  useEffect(() => {
    if (activeWorkspaceId) loadWorkspaceData(activeWorkspaceId);
  }, [activeWorkspaceId, loadWorkspaceData]);

  const loadLeaderInsights = useCallback(async () => {
    if (!activeWorkspaceId || !isLeader) return;
    if (!isWorkspaceLeader && !effectiveTeamId) {
      setInsights(null);
      setInsightsError(null);
      return;
    }
    const seq = ++insightsLoadSeqRef.current;
    setLoadingInsights(true);
    setInsightsError(null);
    try {
      const { data, error } = await createClient().rpc('get_team_wellbeing_insights', {
        p_workspace_id: activeWorkspaceId,
        p_team_id: effectiveTeamId,
        p_days: periodDays,
      });
      if (seq !== insightsLoadSeqRef.current) return;
      if (error) {
        setInsightsError(error.message || 'ไม่สามารถโหลดข้อมูลสรุปของทีมได้');
        setInsights(null);
      } else if (data) {
        setInsights(data as unknown as TeamWellbeingInsights);
      }
    } catch {
      if (seq === insightsLoadSeqRef.current) {
        setInsightsError('เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อโหลดข้อมูลสรุปของทีม');
      }
    } finally {
      if (seq === insightsLoadSeqRef.current) {
        setLoadingInsights(false);
      }
    }
  }, [activeWorkspaceId, isLeader, isWorkspaceLeader, effectiveTeamId, periodDays]);

  useEffect(() => {
    if (isLeader && activeWorkspaceId && !loadingWorkspace) {
      loadLeaderInsights();
    }
  }, [isLeader, activeWorkspaceId, loadingWorkspace, loadLeaderInsights]);

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function handleSwitchWorkspace(nextWsId: string) {
    if (nextWsId === '__NEW__') { router.push('/onboarding'); return; }
    setActiveWorkspaceId(nextWsId);
    setSelectedTeamId(null);
    setInsights(null);
    setInsightsError(null);
    setPreselectedMood(null);
    if (typeof window !== 'undefined') window.localStorage.setItem('burningupp_active_workspace_id', nextWsId);
  }

  if (!activeWorkspace) return null;

  const myTeams = teams.filter((t) => teamMembers.some((tm) => tm.team_id === t.id && tm.user_id === userId));
  const leaderNavItems: { id: LeaderTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'ภาพรวม', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'teams', label: 'ทีมและสมาชิก', icon: <Users className="h-4 w-4" /> },
    { id: 'mood-insights', label: 'แนวโน้มอารมณ์', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'leader-assessments', label: 'แบบประเมิน', icon: <ClipboardCheck className="h-4 w-4" /> },
    { id: 'reports', label: 'รายงานและติดตามผล', icon: <FileSpreadsheet className="h-4 w-4" /> },
  ];
  const memberNavItems: { id: MemberTab; label: string; icon: React.ReactNode }[] = [
    { id: 'my-overview', label: 'ภาพรวมของฉัน', icon: <HeartPulse className="h-4 w-4" /> },
    { id: 'checkin', label: 'บันทึกอารมณ์วันนี้', icon: <SmilePlus className="h-4 w-4" /> },
    { id: 'mood-history', label: 'ประวัติอารมณ์', icon: <CalendarHeart className="h-4 w-4" /> },
    { id: 'member-assessments', label: 'แบบประเมิน', icon: <ClipboardCheck className="h-4 w-4" /> },
    { id: 'profile', label: 'โปรไฟล์ของฉัน', icon: <UserCircle className="h-4 w-4" /> },
  ];

  const showLeaderView = viewMode === 'leader' && isLeader;
  const activeNavItems = showLeaderView ? leaderNavItems : memberNavItems;
  const currentTabId = showLeaderView ? leaderTab : memberTab;
  const handleSelectTab = (id: string) => {
    if (showLeaderView) {
      setLeaderTab(id as LeaderTab);
    } else {
      if (id !== 'checkin') setPreselectedMood(null);
      setMemberTab(id as MemberTab);
    }
  };

  const refreshAll = async () => {
    await loadWorkspaceData(activeWorkspace.id);
    if (isLeader) await loadLeaderInsights();
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5] pb-20 md:pb-8">
      <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-white/95 backdrop-blur-md no-print">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/app"><Logo size="sm" /></Link>
            <select
              aria-label="เลือกพื้นที่ทำงาน"
              value={activeWorkspace.id}
              onChange={(e) => handleSwitchWorkspace(e.target.value)}
              className="max-w-[180px] sm:max-w-[240px] truncate rounded-xl border border-stone-300 bg-[#FAF8F5] px-3 py-1.5 text-xs font-bold text-stone-800 focus:border-teal-700 focus:outline-hidden"
            >
              {workspaces.map((ws) => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
              <option value="__NEW__">+ สร้างหรือเข้าร่วมพื้นที่ทำงานอื่น</option>
            </select>
          </div>
          <div className="flex items-center gap-2.5">
            {isLeader && (
              <div className="inline-flex rounded-xl border border-stone-200 bg-[#FAF8F5] p-1">
                {([['leader', 'มุมมองหัวหน้าทีม'], ['member', 'มุมมองส่วนตัวของฉัน']] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      viewMode === mode ? 'bg-teal-700 text-white shadow-2xs' : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={handleSignOut} title="ออกจากระบบ" className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900">
              <LogOut className="h-3.5 w-3.5" /><span className="hidden sm:inline">ออกจากระบบ</span>
            </button>
          </div>
        </div>
        <div className="hidden md:block border-t border-stone-100 bg-white">
          <div className="mx-auto flex max-w-7xl items-center gap-1 px-4 sm:px-6">
            {activeNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition ${
                  currentTabId === item.id ? 'border-teal-700 text-teal-800' : 'border-transparent text-stone-600 hover:text-stone-900'
                }`}
              >
                {item.icon}{item.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 md:py-8">
        {workspaceError && <StatusBanner type="error" message={workspaceError} className="mb-6" />}
        {loadingWorkspace || !profile ? (
          <div className="rounded-3xl border border-stone-200 bg-white p-14 text-center text-sm text-stone-500">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-teal-700 mb-2" />กำลังโหลดข้อมูลพื้นที่ทำงาน...
          </div>
        ) : showLeaderView ? (
          <>
            {leaderTab === 'overview' && (
              <LeaderOverviewView
                key={activeWorkspace.id}
                workspace={activeWorkspace}
                teams={managedTeams}
                canViewAllTeams={isWorkspaceLeader}
                selectedTeamId={effectiveTeamId}
                onSelectTeam={setSelectedTeamId}
                periodDays={periodDays}
                onSelectPeriod={setPeriodDays}
                insights={insights}
                loadingInsights={loadingInsights}
                insightsError={insightsError}
                onNavigate={setLeaderTab}
              />
            )}
            {leaderTab === 'teams' && (
              <TeamsManagementView
                key={activeWorkspace.id}
                workspace={activeWorkspace}
                isWorkspaceOwner={isWorkspaceOwner}
                isWorkspaceLeader={isWorkspaceLeader}
                teams={teams}
                managedTeams={managedTeams}
                teamMembers={teamMembers}
                directoryMap={directoryMap}
                invitations={invitations}
                currentUserId={userId}
                onRefresh={refreshAll}
              />
            )}
            {leaderTab === 'mood-insights' && (
              <LeaderMoodInsightsView
                key={activeWorkspace.id}
                teams={managedTeams}
                canViewAllTeams={isWorkspaceLeader}
                selectedTeamId={effectiveTeamId}
                onSelectTeam={setSelectedTeamId}
                periodDays={periodDays}
                onSelectPeriod={setPeriodDays}
                insights={insights}
                loadingInsights={loadingInsights}
                insightsError={insightsError}
              />
            )}
            {leaderTab === 'leader-assessments' && (
              <LeaderAssessmentsView
                key={activeWorkspace.id}
                workspace={activeWorkspace}
                teams={managedTeams}
                canViewAllTeams={isWorkspaceLeader}
                selectedTeamId={effectiveTeamId}
                onSelectTeam={setSelectedTeamId}
                periodDays={periodDays}
                onSelectPeriod={setPeriodDays}
                insights={insights}
                loadingInsights={loadingInsights}
                insightsError={insightsError}
                campaigns={campaigns}
                template={template}
                userId={userId}
                onRefresh={refreshAll}
              />
            )}
            {leaderTab === 'reports' && (
              <ReportsAndFollowUpView
                key={activeWorkspace.id}
                workspace={activeWorkspace}
                teams={managedTeams}
                canViewAllTeams={isWorkspaceLeader}
                selectedTeamId={effectiveTeamId}
                onSelectTeam={setSelectedTeamId}
                periodDays={periodDays}
                onSelectPeriod={setPeriodDays}
                insights={insights}
                loadingInsights={loadingInsights}
                insightsError={insightsError}
                reports={reports}
                followUps={followUps}
                userId={userId}
                onRefresh={async () => { await loadWorkspaceData(activeWorkspace.id); }}
              />
            )}
          </>
        ) : (
          <>
            {memberTab === 'my-overview' && (
              <MemberOverviewView
                key={activeWorkspace.id}
                profile={profile}
                workspace={activeWorkspace}
                myTeams={myTeams}
                moodEntries={moodEntries}
                campaigns={campaigns}
                template={template}
                myResults={myResults}
                inProgressResponse={inProgressResponse}
                onNavigate={setMemberTab}
                onQuickSelectMood={(lvl) => {
                  setPreselectedMood(lvl);
                  setMemberTab('checkin');
                }}
              />
            )}
            {memberTab === 'checkin' && (
              <DailyCheckinView
                key={activeWorkspace.id}
                workspace={activeWorkspace}
                myTeams={myTeams}
                moodEntries={moodEntries}
                userId={userId}
                preselectedMood={preselectedMood}
                onSaved={async () => {
                  setPreselectedMood(null);
                  await refreshAll();
                }}
              />
            )}
            {memberTab === 'mood-history' && (
              <MoodHistoryView key={activeWorkspace.id} moodEntries={moodEntries} onDeleted={refreshAll} />
            )}
            {memberTab === 'member-assessments' && (
              <MemberAssessmentsView
                key={activeWorkspace.id}
                workspace={activeWorkspace}
                myTeams={myTeams}
                template={template}
                questions={questions}
                campaigns={campaigns}
                inProgressResponse={inProgressResponse}
                initialDraftAnswers={draftAnswers}
                myResults={myResults}
                userId={userId}
                onSubmitted={refreshAll}
              />
            )}
            {memberTab === 'profile' && (
              <MemberProfileView
                key={activeWorkspace.id}
                profile={profile}
                workspace={activeWorkspace}
                myTeams={myTeams}
                onUpdated={refreshAll}
              />
            )}
          </>
        )}
      </main>

      <nav aria-label="เมนูหลักบนมือถือ" className="fixed bottom-0 inset-x-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur-md md:hidden no-print">
        <div className="grid grid-cols-5">
          {activeNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectTab(item.id)}
              className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold transition ${
                currentTabId === item.id ? 'text-teal-700' : 'text-stone-500'
              }`}
            >
              {item.icon}
              <span className="truncate max-w-[68px]">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
