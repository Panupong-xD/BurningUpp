'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FOLLOW_UP_STATUS_META, FOLLOW_UP_SUGGESTIONS, INSUFFICIENT_DATA_MESSAGE, MOOD_LEVEL_MAP } from '@/lib/constants';
import { followUpSchema } from '@/lib/validation';
import { buildTeamObservations, formatThaiDate } from '@/lib/wellbeing';
import { StatusBanner, UI_BTN_PRIMARY, UI_CARD, UI_INPUT, UI_SUBCARD } from '@/components/ui/Surface';
import { LeaderFilterBar } from './LeaderViews';
import type { FollowUpRow, TeamReportRow, TeamRow, TeamWellbeingInsights, WorkspaceRow } from '@/types/database';
import { FileText, Plus, Printer, RotateCcw, Trash2 } from 'lucide-react';

export function ReportsAndFollowUpView({
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
  reports,
  followUps,
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
  reports: TeamReportRow[];
  followUps: FollowUpRow[];
  userId: string;
  onRefresh: () => Promise<void>;
}) {
  const [fuTeamId, setFuTeamId] = useState<string>(selectedTeamId || teams[0]?.id || '');
  const [fuTitle, setFuTitle] = useState('');
  const [fuDesc, setFuDesc] = useState('');
  const [fuDueDate, setFuDueDate] = useState('');
  const [creatingFu, setCreatingFu] = useState(false);

  const [reportTitle, setReportTitle] = useState('');
  const [reportObservations, setReportObservations] = useState('');
  const [savingReport, setSavingReport] = useState(false);
  const [activeReport, setActiveReport] = useState<TeamReportRow | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);

  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTeamId && teams.some((t) => t.id === selectedTeamId)) {
      setFuTeamId(selectedTeamId);
    } else if (!fuTeamId || !teams.some((t) => t.id === fuTeamId)) {
      setFuTeamId(teams[0]?.id || '');
    }
  }, [selectedTeamId, teams, fuTeamId]);

  useEffect(() => {
    setActiveReport(null);
  }, [selectedTeamId, periodDays]);

  useEffect(() => {
    if (!pendingPrint) return;
    const frame = requestAnimationFrame(() => {
      window.print();
      setPendingPrint(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingPrint, activeReport]);

  const selectedTeamName = selectedTeamId ? teams.find((t) => t.id === selectedTeamId)?.name || 'ทีมที่เลือก' : 'ทุกทีมในพื้นที่ทำงาน';
  const displayedInsights = activeReport?.report_data || insights;
  const autoObservations = displayedInsights ? buildTeamObservations(displayedInsights) : [];

  async function handleCreateFollowUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setFeedback(null);
    const targetTeam = fuTeamId || teams[0]?.id || '';
    const parsed = followUpSchema.safeParse({
      workspaceId: workspace.id,
      teamId: targetTeam,
      title: fuTitle,
      description: fuDesc,
      dueDate: fuDueDate || null,
      status: 'open',
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'กรุณาเลือกทีมและระบุหัวข้อกิจกรรมดูแลทีม');
      return;
    }

    setCreatingFu(true);
    try {
      const { error: insertErr } = await createClient().from('follow_ups').insert({
        workspace_id: parsed.data.workspaceId,
        team_id: parsed.data.teamId,
        title: parsed.data.title,
        description: parsed.data.description,
        due_date: parsed.data.dueDate || null,
        status: 'open',
        created_by: userId,
      });
      if (insertErr) setError(insertErr.message);
      else { setFuTitle(''); setFuDesc(''); setFuDueDate(''); setFeedback('บันทึกกิจกรรมดูแลทีมเรียบร้อยแล้ว'); await onRefresh(); }
    } finally { setCreatingFu(false); }
  }

  async function handleUpdateFollowUpStatus(id: string, status: 'open' | 'in_progress' | 'done') {
    setError(null);
    const { error: updErr } = await createClient()
      .from('follow_ups')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (updErr) {
      setError(updErr.message || 'ไม่สามารถอัปเดตสถานะกิจกรรมได้');
      return;
    }
    await onRefresh();
  }

  async function handleDeleteFollowUp(id: string) {
    setError(null);
    const { error: delErr } = await createClient().from('follow_ups').delete().eq('id', id);
    if (delErr) {
      setError(delErr.message || 'ไม่สามารถลบรายการติดตามผลได้');
      return;
    }
    await onRefresh();
  }

  async function handleSaveReport(e: React.FormEvent) {
    e.preventDefault();
    if (!insights) return;
    setError(null); setFeedback(null);
    const defaultTitle = (reportTitle.trim() || `รายงานสรุปสุขภาวะ · ${selectedTeamName} (${insights.period_days} วัน)`).slice(0, 160);
    const observationsText = (
      reportObservations.trim() ||
      buildTeamObservations(insights).map((o) => `• ${o.title}: ${o.description}`).join('\n')
    ).slice(0, 2000);

    setSavingReport(true);
    try {
      const { data, error: insertErr } = await createClient().from('team_reports').insert({
        workspace_id: workspace.id,
        team_id: selectedTeamId,
        title: defaultTitle,
        period_start: insights.start_date,
        period_end: insights.end_date,
        report_data: insights as unknown as Record<string, unknown>,
        observations: observationsText,
        created_by: userId,
      }).select('*').single();
      if (insertErr) setError(insertErr.message);
      else {
        setReportTitle(''); setReportObservations(''); setFeedback('บันทึกรายงานสรุปของทีมเรียบร้อยแล้ว');
        if (data) setActiveReport(data as unknown as TeamReportRow);
        await onRefresh();
      }
    } finally { setSavingReport(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">รายงานสรุปและการติดตามผลดูแลทีม</h1>
          <p className="text-sm text-stone-600">ออกรายงานสรุปแนวโน้มของทีมและบันทึกกิจกรรมสนับสนุนทีมอย่างเป็นระบบ</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LeaderFilterBar
            teams={teams}
            canViewAllTeams={canViewAllTeams}
            selectedTeamId={selectedTeamId}
            onSelectTeam={onSelectTeam}
            periodDays={periodDays}
            onSelectPeriod={onSelectPeriod}
          />
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50">
            <Printer className="h-3.5 w-3.5" />พิมพ์ / ส่งออก PDF
          </button>
        </div>
      </div>

      {insightsError && <StatusBanner type="error" message={insightsError} className="no-print" />}
      {error && <StatusBanner type="error" message={error} className="no-print" />}
      {feedback && <StatusBanner type="success" message={feedback} className="no-print" />}

      {!loadingInsights && displayedInsights && (
        <div className={`print-card ${UI_CARD} sm:p-8 space-y-6`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-5">
            <div>
              <span className="text-xs font-semibold text-teal-700">
                รายงานสรุปสุขภาวะระดับทีม · {workspace.name}
                {activeReport && ' (ฉบับที่บันทึกไว้)'}
              </span>
              <h2 className="text-xl font-bold text-stone-900 mt-0.5">{activeReport ? activeReport.title : `สรุปภาพรวม: ${selectedTeamName}`}</h2>
              <p className="text-xs text-stone-500 mt-0.5">
                ช่วงเวลารายงาน: {formatThaiDate(activeReport ? activeReport.period_start : displayedInsights.start_date)} ถึง{' '}
                {formatThaiDate(activeReport ? activeReport.period_end : displayedInsights.end_date)} ({displayedInsights.period_days} วัน)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-stone-500">จำนวนสมาชิกทั้งหมด: <strong>{displayedInsights.member_count} คน</strong></div>
              {activeReport && (
                <button
                  type="button"
                  onClick={() => setActiveReport(null)}
                  className="no-print inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  <RotateCcw className="h-3 w-3" />ดูข้อมูลปัจจุบัน
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className={`${UI_SUBCARD} p-4`}>
              <div className="text-xs text-stone-500">การมีส่วนร่วมเช็กอินอารมณ์</div>
              <div className="mt-1 text-xl font-bold text-stone-900">{displayedInsights.mood.participation_rate}% ({displayedInsights.mood.period_participants}/{displayedInsights.member_count} คน)</div>
              <div className="text-xs text-stone-500 mt-0.5">เช็กอินสะสม {displayedInsights.mood.total_checkins} ครั้ง</div>
            </div>
            <div className={`${UI_SUBCARD} p-4`}>
              <div className="text-xs text-stone-500">แนวโน้มอารมณ์ของทีม</div>
              <div className="mt-1 text-xl font-bold text-stone-900">
                {displayedInsights.mood.avg_mood !== null ? `${displayedInsights.mood.avg_mood.toFixed(2)} / 5.00 (${MOOD_LEVEL_MAP[Math.round(displayedInsights.mood.avg_mood)]?.label})` : 'ยังไม่มีข้อมูล'}
              </div>
              <div className="text-xs text-stone-500 mt-0.5">
                {displayedInsights.mood.prev_avg_mood !== null ? `ช่วงก่อนหน้า: ${displayedInsights.mood.prev_avg_mood.toFixed(2)} / 5.00` : 'ไม่มีข้อมูลเปรียบเทียบช่วงก่อนหน้า'}
              </div>
            </div>
            <div className={`${UI_SUBCARD} p-4`}>
              <div className="text-xs text-stone-500">ผลสรุปแบบประเมินระดับทีม</div>
              {displayedInsights.assessment.is_sufficient ? (
                <>
                  <div className="mt-1 text-xl font-bold text-stone-900">{Number(displayedInsights.assessment.overall_score).toFixed(2)} / 5.00</div>
                  <div className="text-xs text-stone-500 mt-0.5">ผู้ตอบ {displayedInsights.assessment.respondent_count} คน ({displayedInsights.assessment.completion_rate}%)</div>
                </>
              ) : (
                <>
                  <div className="mt-1 text-sm font-bold text-amber-800">{INSUFFICIENT_DATA_MESSAGE}</div>
                  <div className="text-xs text-stone-500 mt-0.5">ผู้ตอบ {displayedInsights.assessment.respondent_count}/{displayedInsights.assessment.min_required} คนขั้นต่ำ</div>
                </>
              )}
            </div>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-sm font-bold text-stone-900">ข้อสังเกตสำคัญในช่วงเวลานี้</h3>
            <div className={`${UI_SUBCARD} p-4 space-y-2`}>
              {activeReport && activeReport.observations ? (
                <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-line">{activeReport.observations}</p>
              ) : (
                autoObservations.map((obs) => (
                  <div key={obs.id} className="text-xs text-stone-700 leading-relaxed"><strong className="text-stone-900">• {obs.title}:</strong> {obs.description}</div>
                ))
              )}
            </div>
          </div>

          {!activeReport && (
            <form onSubmit={handleSaveReport} className="border-t border-stone-100 pt-5 space-y-3 no-print">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-stone-700">ชื่อรายงานสำหรับบันทึกเก็บไว้ (ไม่บังคับ)</label>
                  <input type="text" maxLength={160} value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} placeholder={`รายงานสรุปสุขภาวะ · ${selectedTeamName}`} className={UI_INPUT} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700">บันทึกข้อสังเกตของหัวหน้าทีมเพิ่มเติม (ไม่บังคับ)</label>
                  <input type="text" maxLength={2000} value={reportObservations} onChange={(e) => setReportObservations(e.target.value)} placeholder="สรุปสิ่งที่พบหรือแนวทางที่จะนำไปดูแลทีมต่อ" className={UI_INPUT} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-500">รายงานที่บันทึกไว้จะไม่มีข้อมูลส่วนบุคคลหรือบันทึกส่วนตัวของสมาชิก</span>
                <button type="submit" disabled={savingReport} className={`${UI_BTN_PRIMARY} text-xs`}>
                  <FileText className="h-3.5 w-3.5" />{savingReport ? 'กำลังบันทึกรายงาน...' : 'บันทึกรายงานฉบับนี้'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12 no-print">
        <div className={`lg:col-span-7 ${UI_CARD} space-y-5`}>
          <div>
            <h2 className="text-lg font-bold text-stone-900">บันทึกกิจกรรมดูแลและสนับสนุนทีม (Follow-up)</h2>
            <p className="text-xs text-stone-500">จดบันทึกกิจกรรมระดับทีมอย่างง่ายเพื่อติดตามการสนับสนุนทีมของคุณ</p>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-stone-600">เลือกจากตัวอย่างกิจกรรมแนะนำ:</span>
            <div className="flex flex-wrap gap-1.5">
              {FOLLOW_UP_SUGGESTIONS.map((s) => (
                <button key={s.title} type="button" onClick={() => { setFuTitle(s.title); setFuDesc(s.description); }} className="rounded-xl border border-stone-200 bg-[#FAF8F5] px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-teal-600 hover:bg-teal-50/50 transition">
                  + {s.title}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleCreateFollowUp} className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-stone-700">หัวข้อกิจกรรม <span className="text-rose-600">*</span></label>
                <input type="text" required maxLength={160} value={fuTitle} onChange={(e) => setFuTitle(e.target.value)} placeholder="เช่น ทบทวนภาระงานประจำสัปดาห์" className={UI_INPUT} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-stone-700">ทีม</label>
                  <select value={fuTeamId || teams[0]?.id || ''} onChange={(e) => setFuTeamId(e.target.value)} className={`${UI_INPUT} px-2.5`}>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700">วันที่เป้าหมาย</label>
                  <input type="date" value={fuDueDate} onChange={(e) => setFuDueDate(e.target.value)} className={`${UI_INPUT} px-2.5`} />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-700">รายละเอียดเพิ่มเติม (ไม่บังคับ)</label>
              <textarea rows={2} maxLength={1000} value={fuDesc} onChange={(e) => setFuDesc(e.target.value)} placeholder="แนวทางหรือสิ่งที่ต้องการดำเนินการร่วมกับทีม" className={UI_INPUT} />
            </div>
            <button type="submit" disabled={creatingFu || !fuTitle.trim() || teams.length === 0} className={`${UI_BTN_PRIMARY} text-xs`}>
              <Plus className="h-4 w-4" />{creatingFu ? 'กำลังบันทึก...' : 'เพิ่มรายการติดตามผล'}
            </button>
          </form>

          <div className="border-t border-stone-100 pt-4 space-y-3">
            <h3 className="text-sm font-bold text-stone-900">รายการกิจกรรมดูแลทีม ({followUps.length})</h3>
            {followUps.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 p-6 text-center text-xs text-stone-500">ยังไม่มีรายการติดตามผล คลิกเลือกตัวอย่างด้านบนเพื่อเริ่มต้นบันทึก</div>
            ) : (
              <div className="space-y-2.5">
                {followUps.map((fu) => {
                  const statusMeta = FOLLOW_UP_STATUS_META[fu.status];
                  const teamName = teams.find((t) => t.id === fu.team_id)?.name || 'ทีม';
                  return (
                    <div key={fu.id} className={`${UI_SUBCARD} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
                          <span className="text-sm font-bold text-stone-900">{fu.title}</span>
                        </div>
                        {fu.description && <p className="text-xs text-stone-600">{fu.description}</p>}
                        <div className="text-[11px] text-stone-500">
                          ทีม: {teamName} · สร้างเมื่อ {formatThaiDate(fu.created_at)}{fu.due_date && ` · เป้าหมาย ${formatThaiDate(fu.due_date)}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select value={fu.status} onChange={(e) => handleUpdateFollowUpStatus(fu.id, e.target.value as 'open' | 'in_progress' | 'done')} className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-800">
                          <option value="open">รอดำเนินการ</option>
                          <option value="in_progress">กำลังดำเนินการ</option>
                          <option value="done">เสร็จสิ้น</option>
                        </select>
                        <button type="button" onClick={() => handleDeleteFollowUp(fu.id)} title="ลบรายการ" className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className={`lg:col-span-5 ${UI_CARD} space-y-4`}>
          <div>
            <h2 className="text-lg font-bold text-stone-900">รายงานที่บันทึกไว้ ({reports.length})</h2>
            <p className="text-xs text-stone-500">คลิกเพื่อดูสรุปย้อนหลังหรือสั่งพิมพ์เป็นไฟล์ PDF</p>
          </div>
          {reports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 p-8 text-center text-xs text-stone-500">ยังไม่มีรายงานที่บันทึกไว้ กดปุ่ม &ldquo;บันทึกรายงานฉบับนี้&rdquo; ด้านบนเพื่อเก็บสำเนารายงาน</div>
          ) : (
            <div className="space-y-3">
              {reports.map((rep) => {
                const tName = rep.team_id ? teams.find((t) => t.id === rep.team_id)?.name || 'ทีม' : 'ทุกทีม';
                const isSelected = activeReport?.id === rep.id;
                return (
                  <div
                    key={rep.id}
                    className={`${UI_SUBCARD} p-4 space-y-2 transition ${isSelected ? 'border-teal-700 ring-2 ring-teal-700/15 bg-teal-50/30' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" onClick={() => setActiveReport(rep)} className="text-left">
                        <div className="text-sm font-bold text-stone-900 hover:text-teal-800">{rep.title}</div>
                        <div className="text-[11px] text-stone-500 mt-0.5">ทีม: {tName} · ช่วงเวลา {formatThaiDate(rep.period_start)} – {formatThaiDate(rep.period_end)}</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveReport(rep);
                          setPendingPrint(true);
                        }}
                        className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-50 shrink-0"
                      >
                        พิมพ์ PDF
                      </button>
                    </div>
                    {rep.observations && <p className="text-xs text-stone-600 whitespace-pre-line line-clamp-3">{rep.observations}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
