'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { loginSchema } from '@/lib/validation';
import { Logo } from '@/components/ui/Logo';
import { StatusBanner, UI_BTN_PRIMARY, UI_CARD, UI_INPUT_LG, UI_LABEL_LG } from '@/components/ui/Surface';
import { ArrowRight, Loader2, Lock } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const inviteCode = useSearchParams().get('invite') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง'); return; }
    setLoading(true);
    try {
      const { error: signInError } = await createClient().auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
      if (signInError) { setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง'); setLoading(false); return; }
      router.push(inviteCode ? `/onboarding?invite=${encodeURIComponent(inviteCode)}` : '/app');
      router.refresh();
    } catch { setError('เกิดข้อผิดพลาดในการเชื่อมต่อระบบ กรุณาลองใหม่อีกครั้ง'); setLoading(false); }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center bg-[#FAF8F5] px-4 py-12 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="text-center">
          <Link href="/" className="inline-block"><Logo size="lg" /></Link>
          <h1 className="mt-6 text-2xl font-bold text-stone-900">เข้าสู่ระบบใช้งาน</h1>
          <p className="mt-1.5 text-sm text-stone-600">
            {inviteCode ? `เข้าสู่ระบบเพื่อตอบรับคำเชิญเข้าร่วมทีม (${inviteCode})` : 'ดูแลสมดุลการทำงานและเช็กอินอารมณ์ประจำวันของคุณ'}
          </p>
        </div>
        <div className={`mt-8 ${UI_CARD} shadow-xs sm:p-8`}>
          {error && <StatusBanner type="error" message={error} className="mb-5" />}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className={UI_LABEL_LG}>อีเมล</label>
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={UI_INPUT_LG} />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className={UI_LABEL_LG}>รหัสผ่าน</label>
                <Link href="/forgot-password" className="text-xs font-medium text-teal-700 hover:underline">ลืมรหัสผ่าน?</Link>
              </div>
              <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={UI_INPUT_LG} />
            </div>
            <button type="submit" disabled={loading} className={`mt-2 w-full ${UI_BTN_PRIMARY} py-3`}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />กำลังเข้าสู่ระบบ...</> : <>เข้าสู่ระบบ<ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>
          <div className="mt-6 border-t border-stone-100 pt-5 text-center text-sm text-stone-600">
            ยังไม่มีบัญชีผู้ใช้งาน?{' '}
            <Link href={inviteCode ? `/register?invite=${encodeURIComponent(inviteCode)}` : '/register'} className="font-semibold text-teal-700 hover:underline">สมัครสมาชิกใหม่</Link>
          </div>
        </div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-stone-500">
          <Lock className="h-3.5 w-3.5 text-teal-700" />ข้อมูลส่วนบุคคลได้รับการคุ้มครองตามสิทธิ์การเข้าถึงของแต่ละพื้นที่ทำงาน
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] text-sm text-stone-500">กำลังโหลด...</div>}>
      <LoginForm />
    </Suspense>
  );
}
