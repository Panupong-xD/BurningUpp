'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { forgotPasswordSchema } from '@/lib/validation';
import { Logo } from '@/components/ui/Logo';
import { StatusBanner, UI_BTN_PRIMARY, UI_CARD, UI_INPUT_LG, UI_LABEL_LG } from '@/components/ui/Surface';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'กรุณากรอกอีเมลให้ถูกต้อง'); return; }
    setLoading(true);
    try {
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (resetError) {
        const lower = resetError.message.toLowerCase();
        if (lower.includes('rate limit') || lower.includes('too many')) {
          setError('มีการขอรีเซ็ตรหัสผ่านถี่เกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง');
        } else {
          // Do not expose account existence details
          setSent(true);
        }
      } else {
        setSent(true);
      }
    } catch { setError('ไม่สามารถส่งคำขอรีเซ็ตรหัสผ่านได้ในขณะนี้'); } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center bg-[#FAF8F5] px-4 py-12 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="text-center">
          <Link href="/" className="inline-block"><Logo size="lg" /></Link>
          <h1 className="mt-6 text-2xl font-bold text-stone-900">กู้คืนรหัสผ่าน</h1>
          <p className="mt-1.5 text-sm text-stone-600">ระบุอีเมลที่ใช้สมัครสมาชิกเพื่อรับลิงก์ตั้งรหัสผ่านใหม่</p>
        </div>
        <div className={`mt-8 ${UI_CARD} shadow-xs sm:p-8`}>
          {sent ? (
            <div className="space-y-4 text-center py-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></div>
              <h2 className="text-base font-bold text-stone-900">ส่งลิงก์กู้คืนรหัสผ่านเรียบร้อยแล้ว</h2>
              <p className="text-sm text-stone-600 leading-relaxed">หากอีเมล <strong>{email.trim().toLowerCase()}</strong> มีอยู่ในระบบ คุณจะได้รับลิงก์สำหรับตั้งรหัสผ่านใหม่ทางอีเมลของคุณ</p>
              <Link href="/login" className={`mt-4 ${UI_BTN_PRIMARY} px-5`}>กลับไปหน้าเข้าสู่ระบบ</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error && <StatusBanner type="error" message={error} />}
              <div>
                <label htmlFor="email" className={UI_LABEL_LG}>อีเมลของคุณ</label>
                <input id="email" type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={UI_INPUT_LG} />
              </div>
              <button type="submit" disabled={loading} className={`w-full ${UI_BTN_PRIMARY} py-3`}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" />กำลังส่งข้อมูล...</> : 'ส่งลิงก์ตั้งรหัสผ่านใหม่'}
              </button>
            </form>
          )}
          <div className="mt-6 border-t border-stone-100 pt-5 text-center">
            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900">
              <ArrowLeft className="h-4 w-4" />กลับไปหน้าเข้าสู่ระบบ
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
