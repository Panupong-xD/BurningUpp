'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { createWorkspaceSchema, extractInviteToken, joinInvitationSchema } from '@/lib/validation';
import { Logo } from '@/components/ui/Logo';
import { StatusBanner, UI_BTN_PRIMARY, UI_CARD, UI_INPUT, UI_SUBCARD } from '@/components/ui/Surface';
import { ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, Copy, Loader2, PlusCircle, Ticket, Users } from 'lucide-react';

interface CreatedWorkspaceResult {
  workspace_id: string;
  workspace_name: string;
  team_id: string;
  team_name: string;
  invite_token: string;
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialInvite = extractInviteToken(searchParams.get('invite') || '');
  const initialMode = searchParams.get('mode');

  const [mode, setMode] = useState<'choose' | 'create' | 'join' | 'created'>(
    initialInvite ? 'join' : initialMode === 'create' ? 'create' : initialMode === 'join' ? 'join' : 'choose'
  );

  const [workspaceName, setWorkspaceName] = useState('');
  const [firstTeamName, setFirstTeamName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [showOptionalOrg, setShowOptionalOrg] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<CreatedWorkspaceResult | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [inviteToken, setInviteToken] = useState(initialInvite);
  const [previewData, setPreviewData] = useState<{
    valid: boolean;
    workspace_name?: string;
    team_name?: string;
    assigned_role?: string;
    reason?: string;
  } | null>(null);

  const [hasExistingWorkspace, setHasExistingWorkspace] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient().from('workspace_members').select('workspace_id').limit(1).then(({ data }) => {
      if (data && data.length > 0) setHasExistingWorkspace(true);
    });
  }, []);

  const handlePreviewInvite = useCallback(async (tokenToPreview: string) => {
    const clean = extractInviteToken(tokenToPreview);
    if (clean.length < 6) {
      setPreviewData(null);
      return;
    }
    try {
      const { data } = await createClient().rpc('preview_invitation', { p_token: clean });
      if (data && typeof data === 'object') setPreviewData(data as typeof previewData);
    } catch { /* Ignore preview error; full validation runs on submit */ }
  }, []);

  useEffect(() => {
    if (initialInvite && initialInvite.length >= 6) handlePreviewInvite(initialInvite);
  }, [initialInvite, handlePreviewInvite]);

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = createWorkspaceSchema.safeParse({ workspaceName, firstTeamName, organizationName });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'กรุณาตรวจสอบข้อมูลอีกครั้ง'); return; }
    setLoading(true);
    try {
      const { data, error: rpcError } = await createClient().rpc('create_workspace_with_team', {
        p_workspace_name: parsed.data.workspaceName,
        p_first_team_name: parsed.data.firstTeamName,
        p_organization_name: parsed.data.organizationName || null,
      });
      if (rpcError || !data) { setError(rpcError?.message || 'ไม่สามารถสร้างพื้นที่ทำงานได้'); setLoading(false); return; }
      const result = data as CreatedWorkspaceResult;
      if (typeof window !== 'undefined') window.localStorage.setItem('burningupp_active_workspace_id', result.workspace_id);
      setCreatedInfo(result);
      setMode('created');
    } catch { setError('เกิดข้อผิดพลาดในการสร้างพื้นที่ทำงาน กรุณาลองใหม่'); } finally { setLoading(false); }
  }

  async function handleJoinWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleanToken = extractInviteToken(inviteToken);

    const parsed = joinInvitationSchema.safeParse({ token: cleanToken });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'กรุณาระบุรหัสคำเชิญ'); return; }
    setLoading(true);
    try {
      const { data, error: rpcError } = await createClient().rpc('accept_invitation', { p_token: parsed.data.token });
      if (rpcError || !data) { setError(rpcError?.message || 'รหัสคำเชิญไม่ถูกต้อง หมดอายุ หรือถูกใช้งานครบจำนวนแล้ว'); setLoading(false); return; }
      const joined = data as { workspace_id: string };
      if (typeof window !== 'undefined' && joined.workspace_id) window.localStorage.setItem('burningupp_active_workspace_id', joined.workspace_id);
      router.push(`/app?workspace=${encodeURIComponent(joined.workspace_id)}`);
      router.refresh();
    } catch { setError('ไม่สามารถเข้าร่วมพื้นที่ทำงานได้ กรุณาตรวจสอบรหัสคำเชิญ'); setLoading(false); }
  }

  async function copyToClipboard(text: string, type: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'code') { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); }
      else { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }
    } catch {
      setError('ไม่สามารถคัดลอกไปยังคลิปบอร์ดได้ กรุณาคัดลอกข้อความด้วยตนเอง');
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5] px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between">
        <Logo size="md" />
        {hasExistingWorkspace && (
          <Link href="/app" className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50">
            <ArrowLeft className="h-3.5 w-3.5" />กลับไปที่พื้นที่ทำงานเดิม
          </Link>
        )}
      </div>

      <div className="mx-auto my-auto w-full max-w-xl py-8">
        {mode === 'choose' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-stone-900">เริ่มต้นใช้งาน Burning Upp</h1>
              <p className="text-sm sm:text-base text-stone-600">เลือกรูปแบบที่คุณต้องการเริ่มต้นในวันนี้</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 pt-2">
              <button type="button" onClick={() => { setError(null); setMode('create'); }} className="group flex flex-col justify-between rounded-3xl border border-stone-200/90 bg-white p-6 text-left shadow-xs transition hover:border-teal-700 hover:shadow-md">
                <div className="space-y-4">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 group-hover:bg-teal-700 group-hover:text-white transition"><PlusCircle className="h-6 w-6" /></div>
                  <div>
                    <h2 className="text-lg font-bold text-stone-900">สร้างพื้นที่ทำงานใหม่</h2>
                    <p className="mt-1.5 text-sm text-stone-600 leading-relaxed">สำหรับหัวหน้าทีมหรือผู้ดูแลที่ต้องการสร้างพื้นที่ดูแลสุขภาวะให้ทีมของตนเอง</p>
                  </div>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700">สร้างพื้นที่ทำงาน<ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></div>
              </button>

              <button type="button" onClick={() => { setError(null); setMode('join'); }} className="group flex flex-col justify-between rounded-3xl border border-stone-200/90 bg-white p-6 text-left shadow-xs transition hover:border-teal-700 hover:shadow-md">
                <div className="space-y-4">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition"><Ticket className="h-6 w-6" /></div>
                  <div>
                    <h2 className="text-lg font-bold text-stone-900">เข้าร่วมด้วยรหัสคำเชิญ</h2>
                    <p className="mt-1.5 text-sm text-stone-600 leading-relaxed">สำหรับสมาชิกที่ได้รับรหัสคำเชิญหรือลิงก์จากหัวหน้าทีมของคุณแล้ว</p>
                  </div>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700">กรอกรหัสคำเชิญ<ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></div>
              </button>
            </div>
          </div>
        )}

        {mode === 'create' && (
          <div className={`${UI_CARD} shadow-xs sm:p-8 space-y-6`}>
            <div>
              <button type="button" onClick={() => setMode('choose')} className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-800 mb-3">
                <ArrowLeft className="h-3.5 w-3.5" />ย้อนกลับไปเลือกวิธีเริ่มต้น
              </button>
              <h1 className="text-2xl font-bold text-stone-900">สร้างพื้นที่ทำงานใหม่</h1>
              <p className="mt-1 text-sm text-stone-600">ระบุเฉพาะข้อมูลสำคัญเพื่อให้คุณเริ่มต้นใช้งานได้ทันที</p>
            </div>
            {error && <StatusBanner type="error" message={error} />}
            <form onSubmit={handleCreateWorkspace} className="space-y-4">
              <div>
                <label htmlFor="workspaceName" className="block text-sm font-medium text-stone-700">ชื่อพื้นที่ทำงาน (Workspace) <span className="text-rose-600">*</span></label>
                <input id="workspaceName" type="text" required maxLength={120} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="เช่น ฝ่ายพัฒนาผลิตภัณฑ์ หรือ Studio Alpha" className={`${UI_INPUT} mt-1.5 py-2.5`} />
              </div>
              <div>
                <label htmlFor="firstTeamName" className="block text-sm font-medium text-stone-700">ชื่อทีมแรกของคุณ <span className="text-rose-600">*</span></label>
                <input id="firstTeamName" type="text" required maxLength={120} value={firstTeamName} onChange={(e) => setFirstTeamName(e.target.value)} placeholder="เช่น ทีมออกแบบและพัฒนา (Product Team)" className={`${UI_INPUT} mt-1.5 py-2.5`} />
              </div>
              {!showOptionalOrg ? (
                <button type="button" onClick={() => setShowOptionalOrg(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-teal-700">
                  <Building2 className="h-3.5 w-3.5" />+ เพิ่มชื่อบริษัทหรือองค์กร (ไม่บังคับ)
                </button>
              ) : (
                <div>
                  <label htmlFor="organizationName" className="block text-sm font-medium text-stone-700">ชื่อองค์กร / บริษัท (ไม่บังคับ)</label>
                  <input id="organizationName" type="text" maxLength={120} value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="เช่น บริษัท อัลฟ่า เทคโนโลยี จำกัด" className={`${UI_INPUT} mt-1.5 py-2.5`} />
                </div>
              )}
              <div className="pt-2">
                <button type="submit" disabled={loading} className={`w-full ${UI_BTN_PRIMARY} py-3`}>
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" />กำลังสร้างพื้นที่ทำงาน...</> : <>สร้างพื้นที่ทำงานและทีมแรก<ArrowRight className="h-4 w-4" /></>}
                </button>
              </div>
            </form>
          </div>
        )}

        {mode === 'created' && createdInfo && (
          <div className={`${UI_CARD} shadow-xs sm:p-8 space-y-6`}>
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></div>
              <div>
                <h1 className="text-xl font-bold text-stone-900">สร้างพื้นที่ทำงาน &ldquo;{createdInfo.workspace_name}&rdquo; สำเร็จ!</h1>
                <p className="mt-1 text-sm text-stone-600">ทีม <strong>{createdInfo.team_name}</strong> พร้อมใช้งานแล้ว คุณสามารถส่งรหัสคำเชิญให้สมาชิกได้ทันที หรือข้ามไปทำภายหลังก็ได้</p>
              </div>
            </div>

            {error && <StatusBanner type="error" message={error} />}

            <div className={`${UI_SUBCARD} p-5 space-y-4`}>
              <div>
                <div className="text-xs font-medium text-stone-500">รหัสคำเชิญเข้าร่วมทีม {createdInfo.team_name}</div>
                <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl border border-stone-300 bg-white px-3.5 py-2.5">
                  <span className="font-mono text-base font-bold tracking-wider text-stone-900">{createdInfo.invite_token}</span>
                  <button type="button" onClick={() => copyToClipboard(createdInfo.invite_token, 'code')} className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200">
                    {copiedCode ? <><Check className="h-3.5 w-3.5 text-emerald-700" />คัดลอกแล้ว</> : <><Copy className="h-3.5 w-3.5" />คัดลอกรหัส</>}
                  </button>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-stone-500">หรือส่งลิงก์คำเชิญโดยตรง</div>
                <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl border border-stone-300 bg-white px-3.5 py-2">
                  <span className="truncate text-xs text-stone-600">
                    {typeof window !== 'undefined' ? `${window.location.origin}/join/${createdInfo.invite_token}` : `/join/${createdInfo.invite_token}`}
                  </span>
                  <button type="button" onClick={() => copyToClipboard(`${window.location.origin}/join/${createdInfo.invite_token}`, 'link')} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100">
                    {copiedLink ? <><Check className="h-3.5 w-3.5 text-emerald-700" />คัดลอกลิงก์แล้ว</> : <><Copy className="h-3.5 w-3.5" />คัดลอกลิงก์</>}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
              <button type="button" onClick={() => router.push(`/app?workspace=${encodeURIComponent(createdInfo.workspace_id)}`)} className={`w-full sm:w-auto ${UI_BTN_PRIMARY} px-6 py-3`}>
                เข้าสู่แดชบอร์ดพื้นที่ทำงาน<ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className={`${UI_CARD} shadow-xs sm:p-8 space-y-6`}>
            <div>
              <button type="button" onClick={() => setMode('choose')} className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-800 mb-3">
                <ArrowLeft className="h-3.5 w-3.5" />ย้อนกลับไปเลือกวิธีเริ่มต้น
              </button>
              <h1 className="text-2xl font-bold text-stone-900">เข้าร่วมพื้นที่ทำงานด้วยคำเชิญ</h1>
              <p className="mt-1 text-sm text-stone-600">กรอกรหัสคำเชิญ (เช่น BU-XXXXXXXXXXXXXXXX) หรือวางลิงก์ที่ได้รับจากหัวหน้าทีม</p>
            </div>
            {error && <StatusBanner type="error" message={error} />}
            <form onSubmit={handleJoinWorkspace} className="space-y-4">
              <div>
                <label htmlFor="inviteToken" className="block text-sm font-medium text-stone-700">รหัสคำเชิญ หรือลิงก์คำเชิญ</label>
                <input
                  id="inviteToken"
                  type="text"
                  required
                  maxLength={256}
                  value={inviteToken}
                  onChange={(e) => { setInviteToken(e.target.value); setPreviewData(null); }}
                  onBlur={(e) => handlePreviewInvite(e.target.value)}
                  placeholder="BU-XXXXXXXXXXXXXXXX"
                  className={`${UI_INPUT} mt-1.5 py-2.5 font-mono placeholder:font-sans`}
                />
              </div>
              {previewData && previewData.valid && (
                <div className="flex items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50/70 p-4 text-sm text-teal-900">
                  <Users className="h-5 w-5 text-teal-700 shrink-0" />
                  <div>
                    <div className="font-semibold">พบคำเชิญเข้าร่วมทีม &ldquo;{previewData.team_name}&rdquo;</div>
                    <div className="text-xs text-teal-800 mt-0.5">
                      พื้นที่ทำงาน: {previewData.workspace_name} · บทบาท: {previewData.assigned_role === 'leader' ? 'หัวหน้าทีม' : 'สมาชิกทีม'}
                    </div>
                  </div>
                </div>
              )}
              {previewData && !previewData.valid && previewData.reason && (
                <StatusBanner type="error" message={previewData.reason} />
              )}
              <button type="submit" disabled={loading} className={`w-full ${UI_BTN_PRIMARY} py-3`}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" />กำลังเข้าร่วมทีม...</> : <>เข้าร่วมพื้นที่ทำงาน<ArrowRight className="h-4 w-4" /></>}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] text-sm text-stone-500">กำลังเตรียมหน้าเริ่มต้นใช้งาน...</div>}>
      <OnboardingContent />
    </Suspense>
  );
}
