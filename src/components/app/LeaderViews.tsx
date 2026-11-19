'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  DIMENSION_LABELS,
  INSUFFICIENT_DATA_MESSAGE,
  MOOD_FACTORS,
  MOOD_LEVELS,
  MOOD_LEVEL_MAP,
} from '@/lib/constants';
import {
  campaignSchema,
  invitationCreateSchema,
  teamSchema,
  workspaceSettingsSchema,
} from '@/lib/validation';
import {
  buildTeamObservations,
  formatThaiDate,
  formatThaiShortDate,
  getBangkokIsoDateOffset,
  getTodayIsoDate,
} from '@/lib/wellbeing';
import { MoodIllustration } from '@/components/ui/MoodIcon';
import { StatusBanner, UI_BTN_PRIMARY, UI_CARD, UI_INPUT, UI_SUBCARD } from '@/components/ui/Surface';
import type {
  AssessmentCampaignRow,
  AssessmentTemplateRow,
  DirectoryMemberRow,
  InvitationRow,
  TeamMemberRow,
  TeamRow,
  TeamWellbeingInsights,
  WorkspaceRow,
} from '@/types/database';
import { ArrowRight, Check, Copy, Loader2, Lock, Plus, Settings, UserPlus } from 'lucide-react';

export type LeaderTab = 'overview' | 'teams' | 'mood-insights' | 'leader-assessments' | 'reports';

const DIMS = ['energy_exhaustion', 'workload_balance', 'work_engagement'] as const;

export function LeaderFilterBar({
  teams,
  canViewAllTeams = true,
  selectedTeamId,
  onSelectTeam,
  periodDays,
  onSelectPeriod,
}: {
  teams: TeamRow[];
  canViewAllTeams?: boolean;
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string | null) => void;
  periodDays: number;
  onSelectPeriod: (days: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="leaderTeamFilter" className="text-xs font-medium text-stone-600">ทีม:</label>
        <select
          id="leaderTeamFilter"
          value={selectedTeamId || (canViewAllTeams ? 'ALL' : teams[0]?.id || '')}
          onChange={(e) => onSelectTeam(e.target.value === 'ALL' ? null : e.target.value)}
          className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800 focus:border-teal-700 focus:outline-hidden"
        >
          {canViewAllTeams && <option value="ALL">ทุกทีมในพื้นที่ทำงาน</option>}
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="inline-flex rounded-xl border border-stone-200 bg-white p-1">
        {[{ days: 7, label: '7 วัน' }, { days: 14, label: '14 วัน' }, { days: 30, label: '30 วัน' }].map((opt) => (
          <button
            key={opt.days}
            type="button"
            onClick={() => onSelectPeriod(opt.days)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              periodDays === opt.days ? 'bg-teal-700 text-white' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DimensionProgressList({
  scores,
  detailed = false,
}: {
  scores: Record<'energy_exhaustion' | 'workload_balance' | 'work_engagement', number> | null;
  detailed?: boolean;
}) {
  if (!scores) return null;
  return (
    <div className={detailed ? 'space-y-3' : 'space-y-2.5'}>
      {DIMS.map((dim) => {
        const val = Number(scores[dim] ?? 0);
        return (
          <div key={dim} className={detailed ? 'rounded-2xl border border-stone-200/80 p-4 space-y-2' : 'space-y-1'}>
            <div className="flex justify-between text-xs">
              <span className={detailed ? 'font-bold text-stone-800' : 'text-stone-700 font-medium'}>
                {DIMENSION_LABELS[dim]}
              </span>
              <span className={detailed ? 'font-bold text-teal-800' : 'font-bold text-stone-900'}>
                {val.toFixed(2)} / {detailed ? '5.00' : '5'}
              </span>
            </div>
            <div className={`${detailed ? 'h-2.5' : 'h-2'} w-full rounded-full bg-stone-100 overflow-hidden`}>
              <div className="h-full rounded-full bg-teal-700" style={{ width: `${Math.min(100, (val / 5) * 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LeaderOverviewView({
  workspace,
  teams,
  canViewAllTeams = true,
  selectedTeamId,
  onSelectTeam,
  periodDays,
  onSelectPeriod,
  insights,
  loadingInsights,
  insightsError = null,
  onNavigate,
}: {
  workspace: WorkspaceRow;
  teams: TeamRow[];
  canViewAllTeams?: boolean;
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string | null) => void;
  periodDays: number;
  onSelectPeriod: (days: number) => void;
  insights: TeamWellbeingInsights | null;
  loadingInsights: boolean;
  insightsError?: string | null;
  onNavigate: (tab: LeaderTab) => void;
}) {
  const observations = insights ? buildTeamObservations(insights) : [];
  const selectedTeamName = selectedTeamId ? teams.find((t) => t.id === selectedTeamId)?.name || 'ทีมที่เลือก' : 'ทุกทีมในพื้นที่ทำงาน';
  const moodDiff =
    insights?.mood.avg_mood != null && insights?.mood.prev_avg_mood != null
      ? Math.round((insights.mood.avg_mood - insights.mood.prev_avg_mood) * 100) / 100
      : null;

  const visibleTrend = insights ? insights.mood.trend.slice(-14) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-teal-700">
            {workspace.name}{workspace.organization_name && ` · ${workspace.organization_name}`}
          </span>
          <h1 className="text-2xl font-bold text-stone-900 mt-0.5">ภาพรวมสุขภาวะของทีม ({selectedTeamName})</h1>
          <p className="text-sm text-stone-600">สรุปแนวโน้มอารมณ์และการมีส่วนร่วมของสมาชิกเพื่อวางแผนดูแลทีมอย่างเหมาะสม</p>
        </div>
        <LeaderFilterBar
          teams={teams}
          canViewAllTeams={canViewAllTeams}
          selectedTeamId={selectedTeamId}
          onSelectTeam={onSelectTeam}
          periodDays={periodDays}
          onSelectPeriod={onSelectPeriod}
        />
      </div>

      {insightsError ? (
        <StatusBanner type="error" message={insightsError} />
      ) : loadingInsights || !insights ? (
        <div className="rounded-3xl border border-stone-200 bg-white p-12 text-center text-sm text-stone-500">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-teal-700 mb-2" />กำลังโหลดข้อมูลสรุปของทีม...
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className={`${UI_CARD} p-5`}>
              <div className="text-xs font-medium text-stone-500">จำนวนสมาชิกในทีม</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-stone-900">{insights.member_count}</span>
                <span className="text-xs text-stone-500">คน</span>
              </div>
              <p className="mt-2 text-xs text-stone-500">เช็กอินวันนี้แล้ว {insights.mood.today_checkins} คน</p>
            </div>

            <div className={`${UI_CARD} p-5`}>
              <div className="text-xs font-medium text-stone-500">การมีส่วนร่วมบันทึกอารมณ์</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-stone-900">{insights.mood.participation_rate}%</span>
                <span className="text-xs text-stone-500">({insights.mood.period_participants}/{insights.member_count} คน)</span>
              </div>
              <p className="mt-2 text-xs text-stone-500">รวม {insights.mood.total_checkins} ครั้งใน {insights.period_days} วันล่าสุด</p>
            </div>

            <div className={`${UI_CARD} p-5`}>
              <div className="text-xs font-medium text-stone-500">แนวโน้มอารมณ์ของทีม</div>
              {insights.mood.avg_mood !== null ? (
                <>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-stone-900">{insights.mood.avg_mood.toFixed(2)}</span>
                    <span className="text-xs font-semibold text-teal-700">/ 5 ({MOOD_LEVEL_MAP[Math.round(insights.mood.avg_mood)]?.label})</span>
                  </div>
                  <p className="mt-2 text-xs text-stone-500">
                    {moodDiff !== null
                      ? `เปลี่ยนแปลง ${moodDiff >= 0 ? '+' : ''}${moodDiff.toFixed(2)} จากช่วงก่อนหน้า`
                      : 'คำนวณจากสมาชิกที่ยินยอมแชร์ค่าเฉลี่ย'}
                  </p>
                </>
              ) : (
                <div className="mt-3 text-sm font-medium text-stone-500">ยังไม่มีการเช็กอินในช่วงนี้</div>
              )}
            </div>

            <div className={`${UI_CARD} p-5`}>
              <div className="text-xs font-medium text-stone-500">สมาชิกที่ทำแบบประเมินแล้ว</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-stone-900">{insights.assessment.respondent_count}</span>
                <span className="text-xs text-stone-500">/ {insights.member_count} คน ({insights.assessment.completion_rate}%)</span>
              </div>
              <p className="mt-2 text-xs text-stone-500">เกณฑ์ขั้นต่ำเพื่อแสดงผลรวม: {insights.assessment.min_required} คน</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <div className={`lg:col-span-7 ${UI_CARD} space-y-5`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-stone-900">แนวโน้มอารมณ์ของทีม ({insights.period_days} วันล่าสุด)</h2>
                  <p className="text-xs text-stone-500">แสดงค่าเฉลี่ยรายวัน (1 = แย่มาก ถึง 5 = ดีมาก) · วันที่ไม่มีผู้เช็กอินจะแสดงเป็นช่องว่าง</p>
                </div>
                <button type="button" onClick={() => onNavigate('mood-insights')} className="text-xs font-semibold text-teal-700 hover:underline shrink-0">ดูรายละเอียด</button>
              </div>
              <div className={`grid gap-1.5 pt-2 h-44 border-b border-stone-100 pb-2 ${visibleTrend.length <= 7 ? 'grid-cols-7' : 'grid-cols-7 sm:grid-cols-14'}`}>
                {visibleTrend.map((pt) => {
                  const hasVal = pt.avg_mood !== null;
                  const heightPct = hasVal ? Math.max(18, Math.round(((pt.avg_mood || 0) / 5) * 100)) : 10;
                  const roundedLvl = hasVal ? (Math.min(5, Math.max(1, Math.round(pt.avg_mood || 3))) as 1 | 2 | 3 | 4 | 5) : null;
                  return (
                    <div
                      key={pt.date}
                      className="flex flex-col items-center h-full gap-1"
                      title={hasVal ? `${pt.date}: เฉลี่ย ${pt.avg_mood} (${pt.checkin_count} คน)` : `${pt.date}: ไม่มีข้อมูลเช็กอิน`}
                    >
                      <span className="text-[10px] font-bold text-stone-700 h-3.5 leading-none">
                        {hasVal ? Number(pt.avg_mood).toFixed(1) : ''}
                      </span>
                      <div className="flex-1 w-full flex items-end justify-center min-h-0">
                        <div
                          className={`w-full max-w-[28px] rounded-t-lg transition-all ${hasVal ? 'bg-teal-600' : 'bg-stone-100'}`}
                          style={{ height: `${heightPct}%`, backgroundColor: roundedLvl ? MOOD_LEVEL_MAP[roundedLvl]?.color : undefined }}
                        />
                      </div>
                      <span className="text-[10px] text-stone-500 truncate max-w-full">{formatThaiShortDate(pt.date)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`lg:col-span-5 ${UI_CARD} flex flex-col justify-between space-y-5`}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-stone-900">สรุปผลแบบประเมินระดับทีม</h2>
                  <button type="button" onClick={() => onNavigate('leader-assessments')} className="text-xs font-semibold text-teal-700 hover:underline">จัดการแบบประเมิน</button>
                </div>
                <p className="text-xs text-stone-500">ประมวลผลจากชุดคำถามตัวอย่างโดยไม่เปิดเผยคำตอบรายบุคคล</p>
              </div>

              {!insights.assessment.is_sufficient ? (
                <div className="my-auto rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-center space-y-2.5">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800"><Lock className="h-5 w-5" /></div>
                  <div className="text-base font-bold text-stone-900">{insights.assessment.insufficient_message || INSUFFICIENT_DATA_MESSAGE}</div>
                  <p className="text-xs text-stone-600 leading-relaxed">
                    ขณะนี้มีสมาชิกทำแบบประเมินแล้ว <strong>{insights.assessment.respondent_count} คน</strong> ระบบจะแสดงผลสรุประดับทีมเมื่อมีผู้ตอบอย่างน้อย{' '}
                    <strong>{insights.assessment.min_required} คนขึ้นไป</strong> เพื่อคุ้มครองความเป็นส่วนตัวของสมาชิกในทีม
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className={`flex items-baseline justify-between ${UI_SUBCARD} p-4`}>
                    <div>
                      <div className="text-xs text-stone-500">คะแนนความเหนื่อยล้าเฉลี่ยของทีม</div>
                      <div className="text-2xl font-bold text-stone-900 mt-0.5">
                        {Number(insights.assessment.overall_score).toFixed(2)} <span className="text-xs font-normal text-stone-500">/ 5.00</span>
                      </div>
                    </div>
                    <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">ผู้ตอบ {insights.assessment.respondent_count} คน</span>
                  </div>
                  <DimensionProgressList scores={insights.assessment.dimension_scores} />
                </div>
              )}

              <div className="border-t border-stone-100 pt-3 flex items-center justify-between text-xs text-stone-500">
                <span>เกณฑ์คุ้มครองข้อมูลส่วนบุคคล: ขั้นต่ำ {insights.assessment.min_required} คน</span>
                <button type="button" onClick={() => onNavigate('reports')} className="font-semibold text-teal-700 hover:underline">บันทึกกิจกรรมดูแลทีม →</button>
              </div>
            </div>
          </div>

          <div className={`${UI_CARD} space-y-4`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-stone-900">ข้อสังเกตและแนวทางดูแลทีมเบื้องต้น</h2>
                <p className="text-xs text-stone-500">สรุปจากข้อมูลจริงของทีมโดยไม่ระบุตัวตนรายบุคคล และไม่ใช้เพื่อประเมินผลงาน</p>
              </div>
              <button type="button" onClick={() => onNavigate('reports')} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100">
                วางแผนติดตามผล<ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {observations.map((obs) => (
                <div
                  key={obs.id}
                  className={`rounded-2xl border p-4 space-y-1.5 ${
                    obs.tone === 'attention' ? 'border-amber-200 bg-amber-50/60' : obs.tone === 'positive' ? 'border-emerald-200 bg-emerald-50/60' : 'border-stone-200/80 bg-[#FAF8F5]'
                  }`}
                >
                  <div className="text-sm font-bold text-stone-900">{obs.title}</div>
                  <p className="text-xs text-stone-600 leading-relaxed">{obs.description}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function TeamsManagementView({
  workspace,
  isWorkspaceOwner,
  isWorkspaceLeader,
  teams,
  managedTeams,
  teamMembers,
  directoryMap,
  invitations,
  currentUserId,
  onRefresh,
}: {
  workspace: WorkspaceRow;
  isWorkspaceOwner: boolean;
  isWorkspaceLeader: boolean;
  teams: TeamRow[];
  managedTeams: TeamRow[];
  teamMembers: TeamMemberRow[];
  directoryMap: Record<string, DirectoryMemberRow>;
  invitations: InvitationRow[];
  currentUserId: string;
  onRefresh: () => Promise<void>;
}) {
  const managedTeamIds = useMemo(() => new Set(managedTeams.map((t) => t.id)), [managedTeams]);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [inviteTeamId, setInviteTeamId] = useState<string>(managedTeams[0]?.id || '');
  const [inviteRole, setInviteRole] = useState<'member' | 'leader'>('member');
  const [inviteEmail, setInviteEmail] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [wsName, setWsName] = useState(workspace.name);
  const [wsOrgName, setWsOrgName] = useState(workspace.organization_name || '');
  const [wsMinGroup, setWsMinGroup] = useState(workspace.min_group_size || 5);
  const [savingWs, setSavingWs] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWsName(workspace.name);
    setWsOrgName(workspace.organization_name || '');
    setWsMinGroup(workspace.min_group_size || 5);
  }, [workspace.name, workspace.organization_name, workspace.min_group_size]);

  useEffect(() => {
    if (!inviteTeamId || !managedTeams.some((t) => t.id === inviteTeamId)) {
      setInviteTeamId(managedTeams[0]?.id || '');
    }
  }, [managedTeams, inviteTeamId]);

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setFeedback(null);
    const parsed = teamSchema.safeParse({ name: newTeamName, description: newTeamDesc });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'กรุณาตรวจสอบข้อมูลทีม');
      return;
    }
    setCreatingTeam(true);
    try {
      const { error: rpcError } = await createClient().rpc('create_team_in_workspace', {
        p_workspace_id: workspace.id,
        p_name: parsed.data.name,
        p_description: parsed.data.description,
      });
      if (rpcError) setError(rpcError.message);
      else {
        setNewTeamName(''); setNewTeamDesc('');
        setFeedback('สร้างทีมใหม่พร้อมรหัสคำเชิญเริ่มต้นเรียบร้อยแล้ว');
        await onRefresh();
      }
    } finally { setCreatingTeam(false); }
  }

  async function handleCreateInvitation(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setFeedback(null);
    const targetTeamId = inviteTeamId || managedTeams[0]?.id || '';
    const parsed = invitationCreateSchema.safeParse({
      teamId: targetTeamId,
      assignedRole: inviteRole,
      invitedEmail: inviteEmail,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'กรุณาตรวจสอบข้อมูลคำเชิญ');
      return;
    }
    setCreatingInvite(true);
    try {
      const { error: rpcError } = await createClient().rpc('create_team_invitation', {
        p_workspace_id: workspace.id,
        p_team_id: parsed.data.teamId,
        p_invited_email: parsed.data.invitedEmail || null,
        p_assigned_role: parsed.data.assignedRole,
        p_max_uses: parsed.data.invitedEmail ? 1 : 50,
        p_expires_days: 14,
      });
      if (rpcError) setError(rpcError.message);
      else {
        setInviteEmail(''); setFeedback('สร้างรหัสคำเชิญใหม่เรียบร้อยแล้ว');
        await onRefresh();
      }
    } finally { setCreatingInvite(false); }
  }

  async function handleRevokeInvitation(invId: string) {
    setError(null); setFeedback(null);
    const { error: rpcErr } = await createClient().rpc('revoke_team_invitation', {
      p_invitation_id: invId,
    });
    if (rpcErr) {
      setError(rpcErr.message || 'ไม่สามารถยกเลิกรหัสคำเชิญได้');
      return;
    }
    setFeedback('ยกเลิกรหัสคำเชิญเรียบร้อยแล้ว');
    await onRefresh();
  }

  async function handleToggleTeamRole(member: TeamMemberRow) {
    if (member.user_id === currentUserId) return;
    setError(null); setFeedback(null);
    const { error: updErr } = await createClient()
      .from('team_members')
      .update({ role: member.role === 'leader' ? 'member' : 'leader' })
      .eq('id', member.id);
    if (updErr) {
      setError(updErr.message || 'ไม่สามารถเปลี่ยนบทบาทของสมาชิกได้');
      return;
    }
    setFeedback('อัปเดตบทบาทของสมาชิกในทีมเรียบร้อยแล้ว');
    await onRefresh();
  }

  async function handleRemoveTeamMember(memberId: string) {
    setError(null); setFeedback(null);
    const { error: delErr } = await createClient().from('team_members').delete().eq('id', memberId);
    if (delErr) {
      setError(delErr.message || 'ไม่สามารถนำสมาชิกออกจากทีมได้');
      return;
    }
    setFeedback('นำสมาชิกออกจากทีมเรียบร้อยแล้ว');
    await onRefresh();
  }

  async function handleSaveWorkspaceSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!isWorkspaceOwner) return;
    setError(null); setFeedback(null);
    const parsed = workspaceSettingsSchema.safeParse({
      name: wsName,
      organizationName: wsOrgName,
      minGroupSize: Math.floor(Number(wsMinGroup)),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'กรุณาตรวจสอบการตั้งค่าพื้นที่ทำงาน');
      return;
    }
    setSavingWs(true);
    try {
      const { error: updateErr } = await createClient().from('workspaces').update({
        name: parsed.data.name,
        organization_name: parsed.data.organizationName || null,
        min_group_size: parsed.data.minGroupSize,
        updated_at: new Date().toISOString(),
      }).eq('id', workspace.id);
      if (updateErr) setError(updateErr.message);
      else { setFeedback('บันทึกการตั้งค่าพื้นที่ทำงานเรียบร้อยแล้ว'); await onRefresh(); }
    } finally { setSavingWs(false); }
  }

  async function copyInvite(token: string) {
    try {
      await navigator.clipboard.writeText(typeof window !== 'undefined' ? `${window.location.origin}/join/${token}` : token);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      setError('ไม่สามารถคัดลอกลิงก์ได้ กรุณาคัดลอกรหัสด้วยตนเอง');
    }
  }

  const pendingInvitations = invitations.filter((i) => i.status === 'pending' && managedTeamIds.has(i.team_id));
  const displayedTeams = isWorkspaceLeader ? teams : managedTeams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">จัดการทีมและเชิญสมาชิก</h1>
        <p className="text-sm text-stone-600">สร้างทีม เชิญสมาชิกด้วยรหัสหรือลิงก์คำเชิญ และกำหนดสิทธิ์หัวหน้าทีมอย่างง่ายดาย</p>
      </div>
      {error && <StatusBanner type="error" message={error} />}
      {feedback && <StatusBanner type="success" message={feedback} />}

      <div className={`grid gap-6 ${isWorkspaceLeader ? 'lg:grid-cols-2' : ''}`}>
        <div className={`${UI_CARD} space-y-4`}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><UserPlus className="h-5 w-5" /></div>
            <div>
              <h2 className="text-base font-bold text-stone-900">สร้างรหัสหรือลิงก์คำเชิญสมาชิก</h2>
              <p className="text-xs text-stone-500">ส่งรหัสหรือลิงก์ให้สมาชิกเข้าร่วมทีมโดยไม่ต้องตั้งค่าซับซ้อน</p>
            </div>
          </div>

          <form onSubmit={handleCreateInvitation} className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-stone-700">เลือกทีมที่ต้องการเชิญเข้า</label>
                <select value={inviteTeamId || managedTeams[0]?.id || ''} onChange={(e) => setInviteTeamId(e.target.value)} className={UI_INPUT}>
                  {managedTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700">บทบาทในทีม</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'member' | 'leader')} className={UI_INPUT}>
                  <option value="member">สมาชิกทีม (Member)</option>
                  <option value="leader">หัวหน้าทีม (Team Leader)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-700">จำกัดเฉพาะอีเมล (ไม่บังคับ — เว้นว่างได้หากต้องการใช้เป็นรหัสรวมของทีม)</label>
              <input type="email" maxLength={254} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="เว้นว่างเพื่อให้ทุกคนที่มีรหัสเข้าร่วมได้" className={UI_INPUT} />
            </div>
            <button type="submit" disabled={creatingInvite || managedTeams.length === 0} className={`${UI_BTN_PRIMARY} text-xs`}>
              {creatingInvite ? 'กำลังสร้างคำเชิญ...' : 'สร้างรหัสคำเชิญใหม่'}
            </button>
          </form>

          {pendingInvitations.length > 0 && (
            <div className="border-t border-stone-100 pt-4 space-y-2.5">
              <div className="text-xs font-semibold text-stone-700">รหัสคำเชิญที่ใช้งานได้ ({pendingInvitations.length})</div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {pendingInvitations.map((inv) => {
                  const teamName = teams.find((t) => t.id === inv.team_id)?.name || 'ทีม';
                  return (
                    <div key={inv.id} className={`flex items-center justify-between gap-2 ${UI_SUBCARD} px-3.5 py-2.5 text-xs`}>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-stone-900">{inv.token}</span>
                          <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-stone-700 border border-stone-200">{teamName}</span>
                          <span className="text-[11px] text-stone-500">({inv.assigned_role === 'leader' ? 'หัวหน้าทีม' : 'สมาชิก'})</span>
                        </div>
                        <div className="text-[11px] text-stone-500 mt-0.5">
                          ใช้แล้ว {inv.use_count}/{inv.max_uses} ครั้ง · หมดอายุ {formatThaiDate(inv.expires_at)}
                          {inv.invited_email && ` · เฉพาะ ${inv.invited_email}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button type="button" onClick={() => copyInvite(inv.token)} className="inline-flex items-center gap-1 rounded-lg bg-white border border-stone-300 px-2.5 py-1.5 font-semibold text-stone-700 hover:bg-stone-50">
                          {copiedToken === inv.token ? <><Check className="h-3.5 w-3.5 text-emerald-700" />คัดลอกลิงก์แล้ว</> : <><Copy className="h-3.5 w-3.5" />คัดลอกลิงก์</>}
                        </button>
                        <button type="button" onClick={() => handleRevokeInvitation(inv.id)} className="rounded-lg px-2 py-1.5 text-stone-400 hover:text-rose-600">ยกเลิก</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {isWorkspaceLeader && (
          <div className={`${UI_CARD} space-y-4`}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-800"><Plus className="h-5 w-5" /></div>
              <div>
                <h2 className="text-base font-bold text-stone-900">สร้างทีมใหม่ในพื้นที่ทำงาน</h2>
                <p className="text-xs text-stone-500">แบ่งทีมตามสายงานหรือโปรเจกต์เพื่อดูแนวโน้มแยกแต่ละทีมได้ชัดเจน</p>
              </div>
            </div>

            <form onSubmit={handleCreateTeam} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-stone-700">ชื่อทีม <span className="text-rose-600">*</span></label>
                <input type="text" required maxLength={120} value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="เช่น ทีมวิศวกรรมซอฟต์แวร์ หรือ ทีมดูแลลูกค้า" className={UI_INPUT} />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700">คำอธิบายสั้นๆ (ไม่บังคับ)</label>
                <input type="text" maxLength={400} value={newTeamDesc} onChange={(e) => setNewTeamDesc(e.target.value)} placeholder="รายละเอียดเพิ่มเติมเกี่ยวกับทีมนี้" className={UI_INPUT} />
              </div>
              <button type="submit" disabled={creatingTeam || !newTeamName.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-50">
                {creatingTeam ? 'กำลังสร้างทีม...' : '+ เพิ่มทีมใหม่'}
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-stone-900">รายชื่อทีมและสมาชิก ({displayedTeams.length} ทีม)</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {displayedTeams.map((team) => {
            const membersOfTeam = teamMembers.filter((tm) => tm.team_id === team.id);
            const canManageThisTeam = managedTeamIds.has(team.id);
            return (
              <div key={team.id} className={`${UI_CARD} space-y-4`}>
                <div className="flex items-start justify-between gap-2 border-b border-stone-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-stone-900">{team.name}</h3>
                    {team.description && <p className="text-xs text-stone-500 mt-0.5">{team.description}</p>}
                  </div>
                  <span className="rounded-full bg-[#FAF8F5] border border-stone-200 px-3 py-1 text-xs font-semibold text-stone-700">สมาชิก {membersOfTeam.length} คน</span>
                </div>
                {membersOfTeam.length === 0 ? (
                  <p className="text-xs text-stone-500 py-2">ยังไม่มีสมาชิกในทีมนี้</p>
                ) : (
                  <div className="divide-y divide-stone-100">
                    {membersOfTeam.map((tm) => {
                      const prof = directoryMap[tm.user_id];
                      const isSelf = tm.user_id === currentUserId;
                      const isTargetOwner = prof?.workspace_role === 'owner';
                      const canEditMember = canManageThisTeam && !isSelf && !isTargetOwner;
                      return (
                        <div key={tm.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-stone-900">
                              {prof?.full_name || 'สมาชิก'} {isSelf && <span className="text-xs font-normal text-stone-500">(คุณ)</span>}
                            </div>
                            <div className="text-xs text-stone-500">{prof?.email || ''}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tm.role === 'leader' ? 'bg-teal-50 text-teal-800 border border-teal-200' : 'bg-stone-100 text-stone-700'}`}>
                              {isTargetOwner ? 'เจ้าของพื้นที่ทำงาน' : tm.role === 'leader' ? 'หัวหน้าทีม' : 'สมาชิก'}
                            </span>
                            {canEditMember && (
                              <>
                                <button type="button" onClick={() => handleToggleTeamRole(tm)} className="text-xs font-medium text-teal-700 hover:underline">สลับบทบาท</button>
                                <button type="button" onClick={() => handleRemoveTeamMember(tm.id)} className="text-xs font-medium text-rose-600 hover:underline">นำออก</button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {isWorkspaceOwner && (
        <div className={`${UI_CARD} space-y-4`}>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-stone-600" />
            <h2 className="text-base font-bold text-stone-900">ตั้งค่าพื้นที่ทำงาน (สำหรับเจ้าของพื้นที่ทำงาน)</h2>
          </div>
          <form onSubmit={handleSaveWorkspaceSettings} className="grid gap-4 sm:grid-cols-3 items-end">
            <div>
              <label className="block text-xs font-medium text-stone-700">ชื่อพื้นที่ทำงาน</label>
              <input type="text" required maxLength={120} value={wsName} onChange={(e) => setWsName(e.target.value)} className={UI_INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-700">ชื่อองค์กร (ไม่บังคับ)</label>
              <input type="text" maxLength={120} value={wsOrgName} onChange={(e) => setWsOrgName(e.target.value)} placeholder="ระบุชื่อองค์กร" className={UI_INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-700">จำนวนผู้ตอบขั้นต่ำก่อนแสดงผลรวม (5–50 คน)</label>
              <div className="mt-1 flex items-center gap-2">
                <input type="number" min={5} max={50} value={wsMinGroup} onChange={(e) => setWsMinGroup(Number(e.target.value))} className="block w-24 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900" />
                <button type="submit" disabled={savingWs} className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
                  {savingWs ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function LeaderMoodInsightsView({
  teams,
  canViewAllTeams = true,
  selectedTeamId,
  onSelectTeam,
  periodDays,
  onSelectPeriod,
  insights,
  loadingInsights,
  insightsError = null,
}: {
  teams: TeamRow[];
  canViewAllTeams?: boolean;
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string | null) => void;
  periodDays: number;
  onSelectPeriod: (days: number) => void;
  insights: TeamWellbeingInsights | null;
  loadingInsights: boolean;
  insightsError?: string | null;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">แนวโน้มอารมณ์ของทีม</h1>
          <p className="text-sm text-stone-600">วิเคราะห์สัดส่วนความรู้สึก การมีส่วนร่วม และปัจจัยแวดล้อมที่สมาชิกในทีมระบุ</p>
        </div>
        <LeaderFilterBar
          teams={teams}
          canViewAllTeams={canViewAllTeams}
          selectedTeamId={selectedTeamId}
          onSelectTeam={onSelectTeam}
          periodDays={periodDays}
          onSelectPeriod={onSelectPeriod}
        />
      </div>

      {insightsError ? (
        <StatusBanner type="error" message={insightsError} />
      ) : loadingInsights || !insights ? (
        <div className="rounded-3xl border border-stone-200 bg-white p-12 text-center text-sm text-stone-500">กำลังโหลดข้อมูลแนวโน้มอารมณ์...</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className={`lg:col-span-6 ${UI_CARD} space-y-5`}>
            <div>
              <h2 className="text-lg font-bold text-stone-900">สัดส่วนระดับอารมณ์ของทีม</h2>
              <p className="text-xs text-stone-500">จากการเช็กอินทั้งหมด {insights.mood.total_checkins} ครั้ง ในช่วง {insights.period_days} วันที่ผ่านมา</p>
            </div>
            <div className="space-y-3">
              {MOOD_LEVELS.slice().reverse().map((m) => {
                const key = `level_${m.level}` as keyof typeof insights.mood.distribution;
                const count = insights.mood.distribution[key] || 0;
                const pct = insights.mood.total_checkins > 0 ? Math.round((count / insights.mood.total_checkins) * 100) : 0;
                return (
                  <div key={m.level} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <MoodIllustration level={m.level} className="h-6 w-6" />
                        <span className="font-semibold text-stone-800">ระดับ {m.level}: {m.label}</span>
                      </div>
                      <span className="font-bold text-stone-900">{count} ครั้ง ({pct}%)</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-stone-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: m.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`lg:col-span-6 ${UI_CARD} space-y-5`}>
            <div>
              <h2 className="text-lg font-bold text-stone-900">ปัจจัยที่สมาชิกเลือกในการเช็กอิน</h2>
              <p className="text-xs text-stone-500">ช่วยให้หัวหน้าทีมเข้าใจบริบทที่ส่งผลต่อความรู้สึกของสมาชิกในทีม</p>
            </div>
            <div className="space-y-3">
              {MOOD_FACTORS.map((f) => {
                const count = insights.mood.factor_counts?.[f.key] || 0;
                const pct = insights.mood.total_checkins > 0 ? Math.min(100, Math.round((count / insights.mood.total_checkins) * 100)) : 0;
                return (
                  <div key={f.key} className={`${UI_SUBCARD} p-3.5 space-y-1.5`}>
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-stone-900">{f.label}</span>
                        <span className="text-stone-500 ml-2">({f.description})</span>
                      </div>
                      <span className="font-bold text-teal-800">{count} ครั้ง</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-stone-200/70 overflow-hidden">
                      <div className="h-full rounded-full bg-teal-700" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function LeaderAssessmentsView({
  workspace,
  teams,
  canViewAllTeams = true,
  selectedTeamId,
  onSelectTeam,
  periodDays,
  onSelectPeriod,
  insights,
  loadingInsights,
  insightsError = null,
  campaigns,
  template,
  userId,
  onRefresh,
}: {
  workspace: WorkspaceRow;
  teams: TeamRow[];
  canViewAllTeams?: boolean;
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string | null) => void;
  periodDays: number;
  onSelectPeriod: (days: number) => void;
  insights: TeamWellbeingInsights | null;
  loadingInsights: boolean;
  insightsError?: string | null;
  campaigns: AssessmentCampaignRow[];
  template: AssessmentTemplateRow | null;
  userId: string;
  onRefresh: () => Promise<void>;
}) {
  const [newCampaignTitle, setNewCampaignTitle] = useState('');
  const [newCampaignTeamId, setNewCampaignTeamId] = useState<string>(selectedTeamId || teams[0]?.id || '');
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTeamId && teams.some((t) => t.id === selectedTeamId)) {
      setNewCampaignTeamId(selectedTeamId);
    } else if (!newCampaignTeamId || !teams.some((t) => t.id === newCampaignTeamId)) {
      setNewCampaignTeamId(teams[0]?.id || '');
    }
  }, [selectedTeamId, teams, newCampaignTeamId]);

  async function handleCreateCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!template) return;
    setMsg(null); setError(null);
    const targetTeamId = newCampaignTeamId || teams[0]?.id || null;
    const parsed = campaignSchema.safeParse({ title: newCampaignTitle, teamId: targetTeamId });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'กรุณาตรวจสอบข้อมูลรอบการสำรวจ');
      return;
    }

    setCreatingCampaign(true);
    try {
      const { error: insertErr } = await createClient().from('assessment_campaigns').insert({
        workspace_id: workspace.id,
        team_id: parsed.data.teamId ?? null,
        template_id: template.id,
        title: parsed.data.title,
        description: 'รอบการสำรวจสมดุลการทำงานและความเหนื่อยล้าของทีม',
        status: 'active',
        starts_at: getTodayIsoDate(),
        due_date: getBangkokIsoDateOffset(14),
        created_by: userId,
      });
      if (insertErr) {
        setError(insertErr.message || 'ไม่สามารถเปิดรอบแบบประเมินใหม่ได้');
        return;
      }
      setNewCampaignTitle('');
      setMsg('เปิดรอบแบบประเมินใหม่ให้ทีมเรียบร้อยแล้ว');
      await onRefresh();
    } finally { setCreatingCampaign(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">ผลแบบประเมินสมดุลการทำงานของทีม</h1>
          <p className="text-sm text-stone-600">ติดตามอัตราการมีส่วนร่วมและผลสรุปภาพรวมของทีม (แสดงผลเมื่อมีผู้ตอบตั้งแต่ 5 คนขึ้นไป)</p>
        </div>
        <LeaderFilterBar
          teams={teams}
          canViewAllTeams={canViewAllTeams}
          selectedTeamId={selectedTeamId}
          onSelectTeam={onSelectTeam}
          periodDays={periodDays}
          onSelectPeriod={onSelectPeriod}
        />
      </div>

      {error && <StatusBanner type="error" message={error} />}
      {msg && <StatusBanner type="success" message={msg} />}

      {insightsError ? (
        <StatusBanner type="error" message={insightsError} />
      ) : loadingInsights || !insights ? (
        <div className="rounded-3xl border border-stone-200 bg-white p-12 text-center text-sm text-stone-500">กำลังโหลดข้อมูลแบบประเมิน...</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className={`lg:col-span-7 ${UI_CARD} sm:p-7 space-y-5`}>
            <div>
              <h2 className="text-lg font-bold text-stone-900">
                สมาชิกที่ทำแบบประเมินแล้ว: {insights.assessment.respondent_count} / {insights.member_count} คน ({insights.assessment.completion_rate}%)
              </h2>
              <p className="text-xs text-stone-500">เกณฑ์ขั้นต่ำเพื่อแสดงผลรวมระดับทีม: {insights.assessment.min_required} คน</p>
            </div>

            {!insights.assessment.is_sufficient ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-8 text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800"><Lock className="h-6 w-6" /></div>
                <h3 className="text-lg font-bold text-stone-900">{insights.assessment.insufficient_message || INSUFFICIENT_DATA_MESSAGE}</h3>
                <p className="mx-auto max-w-md text-xs sm:text-sm text-stone-600 leading-relaxed">
                  ขณะนี้มีผู้ส่งแบบประเมินแล้ว <strong>{insights.assessment.respondent_count} คน</strong> ต้องมีผู้ตอบอย่างน้อย{' '}
                  <strong>{insights.assessment.min_required} คนขึ้นไป</strong> ระบบจึงจะแสดงคะแนนเฉลี่ยรายมิติ เพื่อป้องกันไม่ให้สามารถคาดเดาคำตอบของสมาชิกรายบุคคลได้
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className={`${UI_SUBCARD} p-4`}>
                    <div className="text-xs text-stone-500">คะแนนความเหนื่อยล้าเฉลี่ยรวม</div>
                    <div className="mt-1 text-3xl font-bold text-stone-900">
                      {Number(insights.assessment.overall_score).toFixed(2)} <span className="text-xs font-normal text-stone-500">/ 5.00</span>
                    </div>
                  </div>
                  <div className={`${UI_SUBCARD} p-4`}>
                    <div className="text-xs text-stone-500">เปรียบเทียบกับรอบก่อนหน้า</div>
                    <div className="mt-1 text-base font-bold text-stone-900">
                      {insights.assessment.prev_overall_score !== null
                        ? `รอบก่อนหน้า: ${Number(insights.assessment.prev_overall_score).toFixed(2)} / 5.00`
                        : 'ยังไม่มีข้อมูลรอบก่อนหน้าที่ครบเกณฑ์ขั้นต่ำ'}
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-stone-800">คะแนนเฉลี่ยแยกตามมิติ (1 = สมดุลดี ถึง 5 = เหนื่อยล้าสูง)</h3>
                  <DimensionProgressList scores={insights.assessment.dimension_scores} detailed />
                </div>
              </div>
            )}
          </div>

          <div className={`lg:col-span-5 ${UI_CARD} space-y-5`}>
            <div>
              <h2 className="text-base font-bold text-stone-900">เปิดรอบการสำรวจใหม่ให้ทีม</h2>
              <p className="text-xs text-stone-500">สร้างรอบการทำแบบสำรวจเพื่อให้สมาชิกในทีมเข้ามาตอบในช่วงเวลาที่กำหนด</p>
            </div>
            <form onSubmit={handleCreateCampaign} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-stone-700">ชื่อรอบการสำรวจ</label>
                <input type="text" required maxLength={160} value={newCampaignTitle} onChange={(e) => setNewCampaignTitle(e.target.value)} placeholder="เช่น สำรวจสมดุลการทำงานประจำเดือนพฤศจิกายน" className={UI_INPUT} />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700">สำหรับทีม</label>
                <select value={newCampaignTeamId} onChange={(e) => setNewCampaignTeamId(e.target.value)} className={UI_INPUT}>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <button type="submit" disabled={creatingCampaign || !newCampaignTitle.trim() || !template} className={`w-full ${UI_BTN_PRIMARY} text-xs`}>
                {creatingCampaign ? 'กำลังเปิดรอบสำรวจ...' : '+ เปิดรอบแบบสำรวจใหม่'}
              </button>
            </form>
            <div className="border-t border-stone-100 pt-4 space-y-2.5">
              <div className="text-xs font-semibold text-stone-700">รอบการสำรวจที่เปิดอยู่ ({campaigns.length})</div>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {campaigns.map((c) => (
                  <div key={c.id} className={`${UI_SUBCARD} p-3 text-xs space-y-1`}>
                    <div className="font-bold text-stone-900">{c.title}</div>
                    <div className="text-stone-500">ทีม: {teams.find((t) => t.id === c.team_id)?.name || 'ทุกทีม'} · กำหนดส่ง {formatThaiDate(c.due_date)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
