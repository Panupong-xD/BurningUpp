'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { resetPasswordSchema } from '@/lib/validation';
import { Logo } from '@/components/ui/Logo';
import {
  StatusBanner,
  UI_BTN_PRIMARY,
  UI_CARD,
  UI_INPUT_LG,
  UI_LABEL_LG,
} from '@/components/ui/Surface';
import { ArrowLeft, CheckCircle2, Loader2, Lock } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setHasSession(Boolean(data.user));
      setCheckingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || session?.user) {
        setHasSession(true);
        setCheckingSession(false);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'กรุณาตรวจสอบรหัสผ่านอีกครั้ง');
      return;
    }

    setLoading(true);
    try {
      const { error: updateErr } = await createClient().auth.updateUser({
        password: parsed.data.password,
      });
      if (updateErr) {
        setError('ไม่สามารถตั้งรหัสผ่านใหม่ได้ ลิงก์อาจหมดอายุแล้ว กรุณาขอลิงก์ใหม่อีกครั้ง');
        return;
      }
      setDone(true);
      setTimeout(() => {
        router.push('/app');
        router.refresh();
      }, 1500);
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อระบบ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center bg-[#FAF8F5] px-4 py-12 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="text-center">
          <Link href="/" className="inline-block">
            <Logo size="lg" />
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-stone-900">ตั้งรหัสผ่านใหม่</h1>
          <p className="mt-1.5 text-sm text-stone-600">
            กำหนดรหัสผ่านใหม่ที่ปลอดภัยสำหรับบัญชีของคุณ
          </p>
        </div>

        <div className={`mt-8 ${UI_CARD} shadow-xs sm:p-8`}>
          {checkingSession ? (
            <div className="py-8 text-center text-sm text-stone-500">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-teal-700 mb-2" />
              กำลังตรวจสอบลิงก์กู้คืนรหัสผ่าน...
            </div>
          ) : done ? (
            <div className="space-y-4 text-center py-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="text-base font-bold text-stone-900">
                เปลี่ยนรหัสผ่านเรียบร้อยแล้ว
              </h2>
              <p className="text-sm text-stone-600">
                กำลังนำคุณเข้าสู่พื้นที่ทำงาน...
              </p>
              <Link href="/app" className={`mt-2 ${UI_BTN_PRIMARY} px-5`}>
                เข้าสู่พื้นที่ทำงาน
              </Link>
            </div>
          ) : !hasSession ? (
            <div className="space-y-4 text-center py-2">
              <StatusBanner
                type="error"
                message="ลิงก์ตั้งรหัสผ่านใหม่ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่อีกครั้ง"
              />
              <Link href="/forgot-password" className={`w-full ${UI_BTN_PRIMARY} py-3`}>
                ขอลิงก์ตั้งรหัสผ่านใหม่
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error && <StatusBanner type="error" message={error} />}
              <div>
                <label htmlFor="newPassword" className={UI_LABEL_LG}>
                  รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)
                </label>
                <input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={72}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="อย่างน้อย 8 ตัวอักษร"
                  className={UI_INPUT_LG}
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className={UI_LABEL_LG}>
                  ยืนยันรหัสผ่านใหม่
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={72}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                  className={UI_INPUT_LG}
                />
              </div>
              <button type="submit" disabled={loading} className={`w-full ${UI_BTN_PRIMARY} py-3`}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    กำลังบันทึกรหัสผ่านใหม่...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    บันทึกรหัสผ่านใหม่
                  </>
                )}
              </button>
            </form>
          )}

          <div className="mt-6 border-t border-stone-100 pt-5 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900"
            >
              <ArrowLeft className="h-4 w-4" />
              กลับไปหน้าเข้าสู่ระบบ
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
