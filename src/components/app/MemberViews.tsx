'use client';

import React, { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  ASSESSMENT_BANDS,
  DIMENSION_LABELS,
  MOOD_FACTORS,
  MOOD_FACTOR_MAP,
  MOOD_LEVELS,
  MOOD_LEVEL_MAP,
} from '@/lib/constants';
import { formatThaiDate, formatThaiShortDate, getTodayIsoDate } from '@/lib/wellbeing';
import { MoodIllustration } from '@/components/ui/MoodIcon';
import { StatusBanner, UI_BTN_PRIMARY, UI_BTN_SECONDARY, UI_CARD, UI_INPUT, UI_SUBCARD } from '@/components/ui/Surface';
import type {
  AssessmentCampaignRow,
  AssessmentQuestionRow,
  AssessmentResponseRow,
  AssessmentResultRow,
  AssessmentTemplateRow,
  MoodEntryRow,
  ProfileRow,
  TeamRow,
  WorkspaceRow,
} from '@/types/database';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock,
  Info,
  Loader2,
  Lock,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

export type MemberTab = 'my-overview' | 'checkin' | 'mood-history' | 'member-assessments' | 'profile';

export function MemberOverviewView({
  profile,
  workspace,
  myTeams,
  moodEntries,
  campaigns,
  template,
  myResults,
  inProgressResponse,
  onNavigate,
}: {
  profile: ProfileRow;
  workspace: WorkspaceRow;
  myTeams: TeamRow[];
  moodEntries: MoodEntryRow[];
  campaigns: AssessmentCampaignRow[];
  template: AssessmentTemplateRow | null;
  myResults: AssessmentResultRow[];
  inProgressResponse: AssessmentResponseRow | null;
  onNavigate: (tab: MemberTab) => void;
}) {
  const todayIso = getTodayIsoDate();
  const todayEntry = useMemo(() => moodEntries.find((m) => m.entry_date === todayIso) || null, [moodEntries, todayIso]);
  const recent7Entries = useMemo(() => moodEntries.slice(0, 7), [moodEntries]);
  const avgRecentMood = useMemo(() => {
    if (recent7Entries.length === 0) return null;
    const sum = recent7Entries.reduce((acc, item) => acc + item.mood_level, 0);
    return Math.round((sum / recent7Entries.length) * 10) / 10;
  }, [recent7Entries]);

  const latestResult = myResults[0] || null;
  const activeCampaign = campaigns.find((c) => c.status === 'active') || campaigns[0] || null;

  return (
    <div className="space-y-6">
      <div className={`${UI_CARD} sm:p-7`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700">
              {workspace.name}{myTeams.length > 0 && ` · ${myTeams.map((t) => t.name).join(', ')}`}
            </span>
            <h1 className="mt-1 text-2xl font-bold text-stone-900">สวัสดีคุณ {profile.full_name}</h1>
            <p className="mt-1 text-sm text-stone-600">พื้นที่ส่วนตัวสำหรับเช็กอินความรู้สึกประจำวันและติดตามสมดุลการทำงานของคุณ</p>
          </div>
          <div className="text-xs text-stone-500 bg-[#FAF8F5] border border-stone-200/70 rounded-2xl px-4 py-2.5 self-start sm:self-center">
            วันที่ {formatThaiDate(todayIso)}
          </div>
        </div>
      </div>

      <div className={`${UI_CARD} sm:p-7`}>
        {todayEntry ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <MoodIllustration level={todayEntry.mood_level} className="h-14 w-14 shrink-0" />
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" />เช็กอินอารมณ์วันนี้เรียบร้อยแล้ว
                </div>
                <h2 className="mt-1 text-lg font-bold text-stone-900">
                  วันนี้คุณรู้สึก &ldquo;{MOOD_LEVEL_MAP[todayEntry.mood_level]?.label}&rdquo;
                </h2>
                {todayEntry.factors.length > 0 && (
                  <p className="mt-0.5 text-xs text-stone-500">
                    ปัจจัยที่ระบุ: {todayEntry.factors.map((f) => MOOD_FACTOR_MAP[f]?.label || f).join(', ')}
                  </p>
                )}
              </div>
            </div>
            <button type="button" onClick={() => onNavigate('checkin')} className={`${UI_BTN_SECONDARY} self-start sm:self-center`}>แก้ไขบันทึกวันนี้</button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-semibold text-teal-700">เช็กอินประจำวัน · ใช้เวลาประมาณ 15 วินาที</span>
                <h2 className="text-xl font-bold text-stone-900 mt-0.5">วันนี้คุณรู้สึกอย่างไร?</h2>
              </div>
              <button type="button" onClick={() => onNavigate('checkin')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:underline">
                ไปที่หน้าเช็กอิน<ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2 sm:gap-3">
              {MOOD_LEVELS.map((m) => (
                <button
                  key={m.level}
                  type="button"
                  onClick={() => onNavigate('checkin')}
                  className={`flex flex-col items-center justify-center gap-2 rounded-2xl border p-3 transition hover:shadow-xs ${m.borderClass} bg-[#FAF8F5]/60 hover:bg-white`}
                >
                  <MoodIllustration level={m.level} className="h-10 w-10 sm:h-11 sm:w-11" />
                  <span className="text-xs sm:text-sm font-semibold text-stone-800">{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className={`flex flex-col justify-between ${UI_CARD} space-y-4`}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
                <ClipboardCheck className="h-3.5 w-3.5" />แบบสำรวจสมดุลการทำงาน
              </span>
              {template && <span className="inline-flex items-center gap-1 text-xs text-stone-500"><Clock className="h-3.5 w-3.5" />~{template.estimated_minutes} นาที</span>}
            </div>
            <h3 className="text-lg font-bold text-stone-900">{activeCampaign?.title || template?.title || 'แบบสำรวจสมดุลการทำงานเบื้องต้น'}</h3>
            <p className="text-sm text-stone-600 leading-relaxed">
              {inProgressResponse
                ? 'คุณมีแบบสำรวจที่ทำค้างไว้ สามารถกลับมาตอบต่อจากข้อเดิมได้ทันที'
                : 'สำรวจระดับพลังงานและภาระงานของคุณ คำตอบรายข้อจะถูกเก็บเป็นความลับส่วนตัว'}
            </p>
          </div>
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-stone-100">
            <span className="text-xs text-stone-500">{latestResult ? `ทำล่าสุดเมื่อ ${formatThaiDate(latestResult.created_at)}` : 'ชุดคำถามตัวอย่าง (9 ข้อ)'}</span>
            <button type="button" onClick={() => onNavigate('member-assessments')} className={UI_BTN_PRIMARY}>
              {inProgressResponse ? 'ทำแบบสำรวจต่อ' : 'เริ่มทำแบบสำรวจ'}<ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className={`flex flex-col justify-between ${UI_CARD} space-y-4`}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                <Calendar className="h-3.5 w-3.5" />สรุปของฉันล่าสุด
              </span>
              <span className="text-xs text-stone-500">บันทึกแล้ว {moodEntries.length} วัน</span>
            </div>
            {avgRecentMood !== null ? (
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-stone-900">{avgRecentMood.toFixed(1)} / 5</span>
                  <span className="text-sm text-stone-600">ค่าเฉลี่ย {recent7Entries.length} ครั้งล่าสุด ({MOOD_LEVEL_MAP[Math.round(avgRecentMood)]?.label})</span>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  {recent7Entries.slice().reverse().map((item) => (
                    <div
                      key={item.id}
                      title={`${item.entry_date}: ${MOOD_LEVEL_MAP[item.mood_level]?.label}`}
                      className="flex flex-col items-center gap-1 rounded-xl border border-stone-200/70 bg-[#FAF8F5] px-2 py-1.5"
                    >
                      <MoodIllustration level={item.mood_level} className="h-6 w-6" />
                      <span className="text-[10px] text-stone-500">{formatThaiShortDate(item.entry_date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-stone-600 leading-relaxed py-2">ยังไม่มีประวัติการเช็กอินอารมณ์ เริ่มบันทึกอารมณ์วันนี้เพื่อดูแนวโน้มรายสัปดาห์ของคุณ</p>
            )}
          </div>
          <div className="pt-2 flex items-center justify-between border-t border-stone-100">
            {latestResult ? (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${ASSESSMENT_BANDS[latestResult.summary_level]?.badgeClass}`}>
                ผลสำรวจล่าสุด: {ASSESSMENT_BANDS[latestResult.summary_level]?.label}
              </span>
            ) : (
              <span className="text-xs text-stone-500">ดูปฏิทินและกราฟย้อนหลัง</span>
            )}
            <button type="button" onClick={() => onNavigate('mood-history')} className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:underline">
              ดูประวัติอารมณ์<ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DailyCheckinView({
  workspace,
  myTeams,
  moodEntries,
  userId,
  onSaved,
}: {
  workspace: WorkspaceRow;
  myTeams: TeamRow[];
  moodEntries: MoodEntryRow[];
  userId: string;
  onSaved: () => Promise<void>;
}) {
  const todayIso = getTodayIsoDate();
  const existingToday = useMemo(() => moodEntries.find((m) => m.entry_date === todayIso) || null, [moodEntries, todayIso]);

  const [selectedLevel, setSelectedLevel] = useState<1 | 2 | 3 | 4 | 5 | null>(existingToday ? existingToday.mood_level : null);
  const [selectedFactors, setSelectedFactors] = useState<string[]>(existingToday ? existingToday.factors : []);
  const [privateNote, setPrivateNote] = useState<string>(existingToday ? existingToday.private_note : '');
  const [showOptionalDetails, setShowOptionalDetails] = useState<boolean>(
    Boolean(existingToday && (existingToday.factors.length > 0 || existingToday.private_note.trim().length > 0))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function toggleFactor(key: string) {
    setSelectedFactors((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccessMsg(null);
    if (!selectedLevel) { setError('กรุณาเลือกระดับความรู้สึกของคุณวันนี้'); return; }
    setSaving(true);
    try {
      const { error: upsertError } = await createClient().from('mood_entries').upsert(
        {
          workspace_id: workspace.id, team_id: myTeams[0]?.id || null, user_id: userId, entry_date: todayIso,
          mood_level: selectedLevel, factors: selectedFactors, private_note: privateNote.trim(), updated_at: new Date().toISOString(),
        },
        { onConflict: 'workspace_id,user_id,entry_date' }
      );
      if (upsertError) { setError(upsertError.message || 'ไม่สามารถบันทึกอารมณ์ได้'); setSaving(false); return; }
      setSuccessMsg('บันทึกความรู้สึกของวันนี้เรียบร้อยแล้ว');
      await onSaved();
    } catch { setError('เกิดข้อผิดพลาดในการเชื่อมต่อระบบ'); } finally { setSaving(false); }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className={`${UI_CARD} sm:p-8`}>
        <div className="text-center space-y-1.5">
          <span className="inline-block rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">บันทึกประจำวัน · {formatThaiDate(todayIso)}</span>
          <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 pt-1">วันนี้คุณรู้สึกอย่างไร?</h1>
          <p className="text-sm text-stone-600">เลือกระดับความรู้สึกที่ตรงกับวันนี้ที่สุด เพียงขั้นตอนเดียวก็บันทึกได้ทันที</p>
        </div>

        {error && <StatusBanner type="error" message={error} className="mt-5" />}
        {successMsg && <StatusBanner type="success" message={successMsg} className="mt-5" />}

        <form onSubmit={handleSave} className="mt-7 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
            {MOOD_LEVELS.map((m) => {
              const isSelected = selectedLevel === m.level;
              return (
                <button
                  key={m.level}
                  type="button"
                  onClick={() => setSelectedLevel(m.level)}
                  aria-pressed={isSelected}
                  className={`flex sm:flex-col items-center gap-3.5 sm:gap-2.5 rounded-2xl border p-3.5 sm:p-4 text-left sm:text-center transition ${
                    isSelected ? m.activeClass : 'border-stone-200/90 bg-[#FAF8F5]/60 hover:bg-stone-50'
                  }`}
                >
                  <MoodIllustration level={m.level} className="h-12 w-12 shrink-0" />
                  <div>
                    <div className="text-sm font-bold text-stone-900">{m.label}</div>
                    <div className="text-[11px] text-stone-500 mt-0.5 leading-snug">{m.subtitle}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-stone-100 pt-4">
            <button
              type="button"
              onClick={() => setShowOptionalDetails((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl bg-[#FAF8F5] px-4 py-3 text-left text-xs font-semibold text-stone-700 hover:bg-stone-100"
            >
              <span>ระบุปัจจัยแวดล้อมหรือบันทึกส่วนตัวเพิ่มเติม (ไม่บังคับ)</span>
              {showOptionalDetails ? <ChevronUp className="h-4 w-4 text-stone-500" /> : <ChevronDown className="h-4 w-4 text-stone-500" />}
            </button>

            {showOptionalDetails && (
              <div className="mt-4 space-y-5 rounded-2xl border border-stone-200/70 bg-[#FAF8F5]/60 p-4 sm:p-5">
                <div>
                  <label className="block text-xs font-semibold text-stone-700">ปัจจัยที่ส่งผลต่อความรู้สึกวันนี้ (เลือกได้มากกว่า 1 ข้อ หรือข้ามได้)</label>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {MOOD_FACTORS.map((f) => {
                      const active = selectedFactors.includes(f.key);
                      return (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => toggleFactor(f.key)}
                          className={`rounded-xl border px-3.5 py-2 text-xs font-medium transition ${
                            active ? 'border-teal-700 bg-teal-700 text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                          }`}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="privateNote" className="block text-xs font-semibold text-stone-700">บันทึกส่วนตัว (ไม่บังคับ)</label>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700"><Lock className="h-3 w-3" />เห็นเฉพาะคุณเท่านั้น</span>
                  </div>
                  <textarea
                    id="privateNote"
                    rows={3}
                    value={privateNote}
                    onChange={(e) => setPrivateNote(e.target.value)}
                    placeholder="จดบันทึกสั้นๆ สำหรับทบทวนตัวเอง (หัวหน้าทีมและคนอื่นไม่สามารถอ่านข้อความนี้ได้)"
                    className={`${UI_INPUT} mt-1.5 py-2.5`}
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving || !selectedLevel}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-6 py-3.5 text-base font-semibold text-white shadow-xs transition hover:bg-teal-800 disabled:opacity-50"
          >
            {saving ? <><Loader2 className="h-5 w-5 animate-spin" />กำลังบันทึก...</> : existingToday ? 'อัปเดตบันทึกอารมณ์วันนี้' : 'บันทึกอารมณ์วันนี้'}
          </button>
        </form>
      </div>
    </div>
  );
}

export function MoodHistoryView({ moodEntries, onDeleted }: { moodEntries: MoodEntryRow[]; onDeleted: () => Promise<void> }) {
  const [range, setRange] = useState<'7d' | '30d'>('7d');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const daysCount = range === '7d' ? 7 : 30;

  const calendarDays = useMemo(() => {
    const map = new Map<string, MoodEntryRow>();
    for (const item of moodEntries) map.set(item.entry_date, item);
    const result: { date: string; entry: MoodEntryRow | null }[] = [];
    const today = new Date(getTodayIsoDate() + 'T00:00:00Z');
    for (let i = daysCount - 1; i >= 0; i--) {
      const iso = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
      result.push({ date: iso, entry: map.get(iso) || null });
    }
    return result;
  }, [moodEntries, daysCount]);

  const recordedDays = useMemo(() => calendarDays.filter((d) => d.entry !== null), [calendarDays]);
  const avgMood = useMemo(() => {
    if (recordedDays.length === 0) return null;
    const sum = recordedDays.reduce((acc, d) => acc + (d.entry?.mood_level || 0), 0);
    return Math.round((sum / recordedDays.length) * 100) / 100;
  }, [recordedDays]);

  async function handleDeleteEntry(id: string) {
    setDeletingId(id);
    try { await createClient().from('mood_entries').delete().eq('id', id); await onDeleted(); } finally { setDeletingId(null); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">ประวัติอารมณ์ของฉัน</h1>
          <p className="text-sm text-stone-600">ทบทวนแนวโน้มความรู้สึกและบันทึกส่วนตัวของคุณตามช่วงเวลา (วันที่ไม่ได้เช็กอินจะแสดงเป็นช่องว่าง)</p>
        </div>
        <div className="inline-flex rounded-xl border border-stone-200 bg-white p-1 self-start">
          {([['7d', 'รายสัปดาห์ (7 วัน)'], ['30d', 'รายเดือน (30 วัน)']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${range === key ? 'bg-teal-700 text-white' : 'text-stone-600 hover:text-stone-900'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={`${UI_CARD} space-y-6`}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className={`${UI_SUBCARD} p-4`}>
            <div className="text-xs text-stone-500">จำนวนวันที่เช็กอิน</div>
            <div className="mt-1 text-2xl font-bold text-stone-900">{recordedDays.length} <span className="text-sm font-normal text-stone-500">/ {daysCount} วัน</span></div>
          </div>
          <div className={`${UI_SUBCARD} p-4`}>
            <div className="text-xs text-stone-500">ค่าเฉลี่ยความรู้สึก</div>
            <div className="mt-1 text-2xl font-bold text-stone-900">
              {avgMood !== null ? (
                <>{avgMood.toFixed(2)} <span className="text-sm font-medium text-teal-700">({MOOD_LEVEL_MAP[Math.round(avgMood)]?.label})</span></>
              ) : (
                <span className="text-sm font-normal text-stone-500">ยังไม่มีข้อมูลในช่วงนี้</span>
              )}
            </div>
          </div>
          <div className={`${UI_SUBCARD} p-4`}>
            <div className="text-xs text-stone-500">สถานะความเป็นส่วนตัว</div>
            <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-teal-800"><Lock className="h-4 w-4 text-teal-700" />บันทึกข้อความเห็นเฉพาะคุณ</div>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-stone-800 mb-3">ปฏิทินและแนวโน้มอารมณ์ ({daysCount} วันล่าสุด)</h2>
          <div className={`grid gap-2 ${range === '7d' ? 'grid-cols-7' : 'grid-cols-5 sm:grid-cols-10'}`}>
            {calendarDays.map((item) => {
              const meta = item.entry ? MOOD_LEVEL_MAP[item.entry.mood_level] : null;
              return (
                <div
                  key={item.date}
                  className={`flex flex-col items-center justify-between rounded-2xl border p-2.5 min-h-[88px] text-center ${
                    meta ? `${meta.bgClass} ${meta.borderClass}` : 'border-dashed border-stone-200 bg-stone-50/40'
                  }`}
                >
                  <span className="text-[11px] font-medium text-stone-500">{formatThaiShortDate(item.date)}</span>
                  {item.entry ? (
                    <>
                      <MoodIllustration level={item.entry.mood_level} className="h-7 w-7 my-1" />
                      <span className="text-[11px] font-semibold text-stone-800">{meta?.label}</span>
                    </>
                  ) : (
                    <span className="my-auto text-[11px] text-stone-400">ไม่ได้บันทึก</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={`${UI_CARD} space-y-4`}>
        <h2 className="text-base font-bold text-stone-900">รายการบันทึกย้อนหลังทั้งหมด ({moodEntries.length})</h2>
        {moodEntries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 p-8 text-center text-sm text-stone-500">ยังไม่มีรายการบันทึกอารมณ์</div>
        ) : (
          <div className="divide-y divide-stone-100">
            {moodEntries.map((entry) => (
              <div key={entry.id} className="py-4 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <MoodIllustration level={entry.mood_level} className="h-10 w-10 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-stone-900">{MOOD_LEVEL_MAP[entry.mood_level]?.label}</span>
                      <span className="text-xs text-stone-500">· {formatThaiDate(entry.entry_date)}</span>
                    </div>
                    {entry.factors.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {entry.factors.map((f) => (
                          <span key={f} className="rounded-lg bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">{MOOD_FACTOR_MAP[f]?.label || f}</span>
                        ))}
                      </div>
                    )}
                    {entry.private_note && (
                      <p className="mt-1.5 rounded-xl bg-[#FAF8F5] px-3 py-2 text-xs text-stone-700 border border-stone-200/60">
                        <span className="font-semibold text-stone-500 mr-1.5">[บันทึกส่วนตัว]</span>{entry.private_note}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={deletingId === entry.id}
                  onClick={() => handleDeleteEntry(entry.id)}
                  title="ลบบันทึกนี้"
                  className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600 transition"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function MemberAssessmentsView({
  workspace,
  myTeams,
  template,
  questions,
  campaigns,
  inProgressResponse,
  initialDraftAnswers,
  myResults,
  userId,
  onSubmitted,
}: {
  workspace: WorkspaceRow;
  myTeams: TeamRow[];
  template: AssessmentTemplateRow | null;
  questions: AssessmentQuestionRow[];
  campaigns: AssessmentCampaignRow[];
  inProgressResponse: AssessmentResponseRow | null;
  initialDraftAnswers: Record<string, number>;
  myResults: AssessmentResultRow[];
  userId: string;
  onSubmitted: () => Promise<void>;
}) {
  const [isTaking, setIsTaking] = useState(false);
  const [currentIdx, setCurrentIdx] = useState<number>(() =>
    inProgressResponse && inProgressResponse.current_step > 1 ? Math.min(questions.length - 1, inProgressResponse.current_step - 1) : 0
  );
  const [answers, setAnswers] = useState<Record<string, number>>(initialDraftAnswers || {});
  const [responseId, setResponseId] = useState<string | null>(inProgressResponse?.id || null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSubmittedResult, setJustSubmittedResult] = useState<AssessmentResultRow | null>(null);

  const activeCampaign = campaigns.find((c) => c.status === 'active') || campaigns[0] || null;
  const currentQuestion = questions[currentIdx] || null;
  const answeredCount = Object.keys(answers).length;

  async function handleSelectOption(questionId: string, val: number) {
    setError(null);
    setAnswers({ ...answers, [questionId]: val });
    if (!template) return;
    setSavingDraft(true);
    try {
      const supabase = createClient();
      let currentRespId = responseId;
      if (!currentRespId) {
        const { data: createdResp } = await supabase.from('assessment_responses').insert({
          workspace_id: workspace.id, team_id: myTeams[0]?.id || null, campaign_id: activeCampaign?.id || null,
          template_id: template.id, user_id: userId, status: 'in_progress', current_step: currentIdx + 1,
        }).select('id').single();
        if (createdResp?.id) { currentRespId = createdResp.id; setResponseId(createdResp.id); }
      } else {
        await supabase.from('assessment_responses').update({ current_step: currentIdx + 1, updated_at: new Date().toISOString() }).eq('id', currentRespId);
      }
      if (currentRespId) {
        await supabase.from('assessment_answers').upsert(
          { response_id: currentRespId, question_id: questionId, user_id: userId, answer_value: val, updated_at: new Date().toISOString() },
          { onConflict: 'response_id,question_id' }
        );
      }
    } finally { setSavingDraft(false); }
  }

  async function handleSubmitAssessment() {
    if (!template) return;
    setError(null);
    if (Object.keys(answers).length < questions.length) { setError('กรุณาตอบคำถามให้ครบทุกข้อก่อนส่งแบบสำรวจ'); return; }
    setSubmitting(true);
    try {
      const { data, error: rpcError } = await createClient().rpc('submit_burnout_assessment', {
        p_workspace_id: workspace.id, p_team_id: myTeams[0]?.id || null, p_campaign_id: activeCampaign?.id || null,
        p_template_id: template.id, p_answers: answers, p_response_id: responseId,
      });
      if (rpcError || !data) { setError(rpcError?.message || 'ไม่สามารถส่งแบบสำรวจได้'); setSubmitting(false); return; }
      setJustSubmittedResult(data as AssessmentResultRow);
      setIsTaking(false);
      await onSubmitted();
    } catch { setError('เกิดข้อผิดพลาดในการส่งแบบสำรวจ'); } finally { setSubmitting(false); }
  }

  if (!template || questions.length === 0) {
    return <div className="rounded-3xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-600">ยังไม่มีแบบสำรวจที่เปิดใช้งานในขณะนี้</div>;
  }

  if (isTaking && currentQuestion) {
    const selectedVal = answers[currentQuestion.id];
    const progressPct = Math.round(((currentIdx + 1) / questions.length) * 100);
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className={`${UI_CARD} sm:p-8 space-y-6`}>
          <div className="flex items-center justify-between text-xs text-stone-500">
            <button type="button" onClick={() => setIsTaking(false)} className="inline-flex items-center gap-1 font-medium text-stone-600 hover:text-stone-900">
              <ArrowLeft className="h-3.5 w-3.5" />พักไว้ก่อน (บันทึกอัตโนมัติ)
            </button>
            <span>ข้อที่ {currentIdx + 1} จาก {questions.length} {savingDraft && '· กำลังบันทึก...'}</span>
          </div>
          <div className="space-y-1.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-teal-700 transition-all duration-300" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-stone-500">
              <span>หมวด: {currentQuestion.category_label}</span>
              <span>ตอบแล้ว {answeredCount}/{questions.length} ข้อ</span>
            </div>
          </div>
          {error && <StatusBanner type="error" message={error} />}
          <div className="py-2">
            <h2 className="text-xl sm:text-2xl font-bold text-stone-900 leading-snug">{currentQuestion.question_order}. {currentQuestion.prompt}</h2>
            <p className="mt-1.5 text-xs text-stone-500">ในช่วง 2 สัปดาห์ที่ผ่านมา คุณรู้สึกเช่นนี้บ่อยเพียงใด?</p>
          </div>
          <div className="space-y-2.5">
            {currentQuestion.options.map((opt) => {
              const isSelected = selectedVal === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelectOption(currentQuestion.id, opt.value)}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left transition ${
                    isSelected ? 'border-teal-700 bg-teal-50/80 ring-2 ring-teal-700/15' : 'border-stone-200 bg-[#FAF8F5]/60 hover:bg-stone-50'
                  }`}
                >
                  <span className="text-sm sm:text-base font-medium text-stone-900">{opt.label}</span>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${isSelected ? 'border-teal-700 bg-teal-700 text-white' : 'border-stone-300 bg-white text-stone-500'}`}>
                    {opt.value}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-stone-100 pt-5">
            <button type="button" disabled={currentIdx === 0} onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))} className={`${UI_BTN_SECONDARY} disabled:opacity-40`}>
              <ArrowLeft className="h-4 w-4" />ข้อก่อนหน้า
            </button>
            {currentIdx < questions.length - 1 ? (
              <button type="button" disabled={!selectedVal} onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))} className={`${UI_BTN_PRIMARY} px-5 disabled:opacity-40`}>
                ข้อถัดไป<ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" disabled={submitting || answeredCount < questions.length} onClick={handleSubmitAssessment} className={`${UI_BTN_PRIMARY} px-6`}>
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />กำลังประมวลผล...</> : <>ส่งคำตอบแบบสำรวจ<CheckCircle2 className="h-4 w-4" /></>}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {justSubmittedResult && (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-6 space-y-2">
          <div className="flex items-center gap-2 text-emerald-800 font-bold"><CheckCircle2 className="h-5 w-5 text-emerald-700" />ส่งแบบสำรวจเรียบร้อยแล้ว</div>
          <p className="text-sm text-emerald-900">
            ผลสรุปเบื้องต้นของคุณคือ <strong>{ASSESSMENT_BANDS[justSubmittedResult.summary_level]?.label}</strong> (คะแนนความเหนื่อยล้าเฉลี่ย {Number(justSubmittedResult.overall_score).toFixed(2)} / 5)
          </p>
        </div>
      )}

      <div className={`${UI_CARD} sm:p-8 space-y-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-900">
            <Info className="h-3.5 w-3.5" />ชุดคำถามตัวอย่าง (Sample Assessment)
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-stone-500">
            <Clock className="h-3.5 w-3.5" />เวลาในการทำประมาณ {template.estimated_minutes} นาที ({questions.length} ข้อ)
          </span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-stone-900">{template.title}</h1>
          <p className="mt-1.5 text-sm text-stone-600 leading-relaxed">{template.description}</p>
        </div>
        <div className={`${UI_SUBCARD} p-4 space-y-2 text-xs text-stone-600 leading-relaxed`}>
          <div className="font-semibold text-stone-800">คำแนะนำและข้อตกลงความโปร่งใส:</div>
          <p>{template.instructions}</p>
          <p className="text-stone-500">{template.disclaimer}</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <Lock className="h-4 w-4 text-teal-700 shrink-0" />
            <span>หัวหน้าทีมจะเห็นเฉพาะค่าเฉลี่ยรวมของทีมเมื่อมีผู้ตอบครบ 5 คนขึ้นไปเท่านั้น</span>
          </div>
          <button type="button" onClick={() => setIsTaking(true)} className={`${UI_BTN_PRIMARY} rounded-2xl px-6 py-3 shrink-0`}>
            {inProgressResponse && answeredCount > 0 ? `ทำแบบสำรวจต่อ (ตอบแล้ว ${answeredCount}/${questions.length} ข้อ)` : 'เริ่มทำแบบสำรวจ'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className={`${UI_CARD} sm:p-7 space-y-5`}>
        <h2 className="text-lg font-bold text-stone-900">ประวัติผลสำรวจของฉัน ({myResults.length})</h2>
        {myResults.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 p-8 text-center text-sm text-stone-500">คุณยังไม่มีประวัติการส่งแบบสำรวจในพื้นที่ทำงานนี้</div>
        ) : (
          <div className="space-y-4">
            {myResults.map((res) => {
              const band = ASSESSMENT_BANDS[res.summary_level] || ASSESSMENT_BANDS.balanced;
              return (
                <div key={res.id} className="rounded-2xl border border-stone-200/80 bg-[#FAF8F5]/70 p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${band.badgeClass}`}>{band.label}</span>
                      <div className="mt-1.5 text-xs text-stone-500">บันทึกเมื่อ {formatThaiDate(res.created_at)}</div>
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="text-xs text-stone-500">ระดับความเหนื่อยล้าเฉลี่ย</div>
                      <div className="text-2xl font-bold text-stone-900">{Number(res.overall_score).toFixed(2)} <span className="text-xs font-normal text-stone-500">/ 5.00</span></div>
                    </div>
                  </div>
                  <p className="text-xs text-stone-600">{band.description}</p>
                  <div className="grid gap-3 sm:grid-cols-3 pt-1">
                    {(['energy_exhaustion', 'workload_balance', 'work_engagement'] as const).map((dimKey) => {
                      const score = Number(res.dimension_scores?.[dimKey] ?? 0);
                      return (
                        <div key={dimKey} className="rounded-xl border border-stone-200/80 bg-white p-3 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-stone-700">{DIMENSION_LABELS[dimKey]}</span>
                            <span className="font-bold text-stone-900">{score.toFixed(1)}/5</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                            <div className="h-full rounded-full bg-teal-700" style={{ width: `${Math.min(100, (score / 5) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function MemberProfileView({
  profile,
  workspace,
  onUpdated,
}: {
  profile: ProfileRow;
  workspace: WorkspaceRow;
  myTeams?: TeamRow[];
  onUpdated: () => Promise<void>;
}) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [consentMoodSharing, setConsentMoodSharing] = useState(profile.consent_mood_sharing);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavedMsg(null);
    if (!fullName.trim()) return;
    setSaving(true);
    try {
      const supabase = createClient();
      await supabase.from('profiles').update({ full_name: fullName.trim(), consent_mood_sharing: consentMoodSharing, updated_at: new Date().toISOString() }).eq('id', profile.id);
      await supabase.from('consent_records').insert({ user_id: profile.id, workspace_id: workspace.id, consent_type: 'mood_aggregate_sharing', granted: consentMoodSharing });
      setSavedMsg('บันทึกการตั้งค่าโปรไฟล์และความเป็นส่วนตัวเรียบร้อยแล้ว');
      await onUpdated();
    } finally { setSaving(false); }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className={`${UI_CARD} sm:p-8 space-y-6`}>
        <div>
          <h1 className="text-2xl font-bold text-stone-900">โปรไฟล์และการตั้งค่าความเป็นส่วนตัว</h1>
          <p className="mt-1 text-sm text-stone-600">จัดการข้อมูลผู้ใช้งานและการให้ความยินยอมในการคำนวณข้อมูลภาพรวมของทีม</p>
        </div>
        {savedMsg && <StatusBanner type="success" message={savedMsg} />}
        <form onSubmit={handleSaveProfile} className="space-y-5">
          <div>
            <label htmlFor="profileEmail" className="block text-sm font-medium text-stone-700">อีเมลบัญชีผู้ใช้</label>
            <input id="profileEmail" type="email" disabled value={profile.email} className="mt-1.5 block w-full rounded-xl border border-stone-200 bg-stone-100 px-3.5 py-2.5 text-sm text-stone-500" />
          </div>
          <div>
            <label htmlFor="profileName" className="block text-sm font-medium text-stone-700">ชื่อ-นามสกุล หรือชื่อที่ใช้แสดง</label>
            <input id="profileName" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className={`${UI_INPUT} mt-1.5 py-2.5`} />
          </div>
          <div className={`${UI_SUBCARD} p-4 space-y-3`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-stone-900">ยินยอมให้นำระดับอารมณ์ไปคำนวณค่าเฉลี่ยรวมของทีม</div>
                <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                  เมื่อเปิดใช้งาน เฉพาะระดับตัวเลข (1–5) และป้ายปัจจัยจะถูกนำไปคำนวณแนวโน้มรวมของทีมโดยไม่ระบุตัวตน
                  ทั้งนี้ <strong>บันทึกข้อความส่วนตัว (Private Note)</strong> จะยังคงเป็นความลับและไม่ถูกเปิดเผยในทุกกรณี
                </p>
              </div>
              <input type="checkbox" checked={consentMoodSharing} onChange={(e) => setConsentMoodSharing(e.target.checked)} className="mt-1 h-5 w-5 accent-teal-700 rounded-md" />
            </div>
          </div>
          <div className="rounded-2xl border border-stone-200/80 bg-white p-4 space-y-2 text-xs text-stone-600">
            <div className="flex items-center gap-1.5 font-semibold text-stone-800"><ShieldCheck className="h-4 w-4 text-teal-700" />การคุ้มครองข้อมูลส่วนบุคคล (PDPA-Aware Privacy Design)</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>คุณสามารถลบบันทึกอารมณ์รายวันของคุณได้ด้วยตนเองทุกเมื่อในหน้า &ldquo;ประวัติอารมณ์&rdquo;</li>
              <li>คำตอบรายข้อในแบบประเมินถูกจำกัดสิทธิ์ด้วย Row Level Security ให้เฉพาะคุณเท่านั้นที่เข้าถึงได้</li>
              <li>ข้อมูลในระบบมีไว้เพื่อการสนับสนุนสุขภาวะของทีม ห้ามนำไปใช้ประเมินผลการปฏิบัติงานส่วนบุคคล</li>
            </ul>
          </div>
          <button type="submit" disabled={saving} className={`${UI_BTN_PRIMARY} px-5`}>{saving ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}</button>
        </form>
      </div>
    </div>
  );
}
