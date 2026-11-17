'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { registerSchema } from '@/lib/validation';
import { Logo } from '@/components/ui/Logo';
import { StatusBanner, UI_BTN_PRIMARY, UI_CARD, UI_INPUT_LG, UI_LABEL_LG, UI_SUBCARD } from '@/components/ui/Surface';
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react';

function RegisterForm() {
  const router = useRouter();
  const inviteCode = useSearchParams().get('invite') || '';
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = registerSchema.safeParse({ fullName, email, password });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'กรุณาตรวจสอบข้อมูลอีกครั้ง'); return; }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: { data: { full_name: parsed.data.fullName } },
      });
      if (signUpError) {
        setError(signUpError.message.toLowerCase().includes('already registered') ? 'อีเมลนี้มีในระบบแล้ว กรุณาเข้าสู่ระบบแทน' : signUpError.message || 'ไม่สามารถสร้างบัญชีได้ กรุณาลองใหม่');
        setLoading(false);
        return;
      }
      if (!signUpData.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
        if (signInError) {
          setError('สร้างบัญชีสำเร็จแล้ว กรุณาเข้าสู่ระบบ');
          router.push(inviteCode ? `/login?invite=${encodeURIComponent(inviteCode)}` : '/login');
          return;
        }
      }
      await supabase.rpc('ensure_user_profile', { p_full_name: parsed.data.fullName });
      router.push(inviteCode ? `/onboarding?invite=${encodeURIComponent(inviteCode)}` : '/onboarding');
      router.refresh();
    } catch { setError('เกิดข้อผิดพลาดในการเชื่อมต่อระบบ กรุณาลองใหม่อีกครั้ง'); setLoading(false); }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center bg-[#FAF8F5] px-4 py-12 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="text-center">
          <Link href="/" className="inline-block"><Logo size="lg" /></Link>
          <h1 className="mt-6 text-2xl font-bold text-stone-900">สร้างบัญชีผู้ใช้งาน</h1>
          <p className="mt-1.5 text-sm text-stone-600">
            {inviteCode ? `สมัครสมาชิกเพื่อเข้าร่วมทีมด้วยรหัสคำเชิญ (${inviteCode})` : 'เริ่มต้นใช้งานง่ายๆ ใช้เวลาไม่ถึง 1 นาที'}
          </p>
        </div>
        <div className={`mt-8 ${UI_CARD} shadow-xs sm:p-8`}>
          {error && <StatusBanner type="error" message={error} className="mb-5" />}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="fullName" className={UI_LABEL_LG}>ชื่อ-นามสกุล หรือชื่อที่ใช้แสดงในทีม</label>
              <input id="fullName" type="text" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="เช่น พิมพ์ชนก ใจดี" className={UI_INPUT_LG} />
            </div>
            <div>
              <label htmlFor="email" className={UI_LABEL_LG}>อีเมล</label>
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={UI_INPUT_LG} />
            </div>
            <div>
              <label htmlFor="password" className={UI_LABEL_LG}>รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)</label>
              <input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="อย่างน้อย 6 ตัวอักษร" className={UI_INPUT_LG} />
            </div>
            <div className={`${UI_SUBCARD} p-3.5 text-xs text-stone-600 leading-relaxed`}>
              <div className="flex items-center gap-1.5 font-semibold text-stone-800 mb-1"><ShieldCheck className="h-4 w-4 text-teal-700 shrink-0" />คำชี้แจงด้านความเป็นส่วนตัว</div>
              ระบบเก็บข้อมูลเท่าที่จำเป็นเพื่อแสดงประวัติส่วนตัวของคุณและคำนวณแนวโน้มภาพรวมของทีม บันทึกส่วนตัวและคำตอบรายข้อจะไม่ถูกเปิดเผยให้หัวหน้าทีมเห็น
            </div>
            <button type="submit" disabled={loading} className={`mt-2 w-full ${UI_BTN_PRIMARY} py-3`}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />กำลังสร้างบัญชี...</> : <>ดำเนินการต่อ<ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>
          <div className="mt-6 border-t border-stone-100 pt-5 text-center text-sm text-stone-600">
            มีบัญชีผู้ใช้งานอยู่แล้ว?{' '}
            <Link href={inviteCode ? `/login?invite=${encodeURIComponent(inviteCode)}` : '/login'} className="font-semibold text-teal-700 hover:underline">เข้าสู่ระบบ</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] text-sm text-stone-500">กำลังโหลด...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
