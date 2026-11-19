import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { extractInviteToken } from '@/lib/validation';
import { Logo } from '@/components/ui/Logo';
import { ArrowRight, Users } from 'lucide-react';

export default async function JoinInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let decoded = token;
  try {
    decoded = decodeURIComponent(token);
  } catch {
    decoded = token;
  }
  const cleanToken = extractInviteToken(decoded);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(
      cleanToken
        ? `/onboarding?invite=${encodeURIComponent(cleanToken)}`
        : '/onboarding?mode=join'
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center bg-[#FAF8F5] px-4 py-12 sm:px-6">
      <div className="mx-auto w-full max-w-md text-center">
        <Logo size="lg" />
        <div className="mt-8 rounded-3xl border border-stone-200 bg-white p-7 shadow-xs space-y-5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
            <Users className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            {cleanToken && (
              <span className="inline-block rounded-full bg-stone-100 px-3 py-1 text-xs font-mono font-semibold text-stone-700">
                รหัสคำเชิญ: {cleanToken}
              </span>
            )}
            <h1 className="text-xl font-bold text-stone-900 pt-1">
              คุณได้รับคำเชิญเข้าร่วมทีมบน Burning Upp
            </h1>
            <p className="text-sm text-stone-600 leading-relaxed">
              เข้าสู่ระบบหรือสร้างบัญชีใหม่เพื่อเข้าร่วมพื้นที่ทำงานของทีมคุณได้ทันที
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <Link
              href={cleanToken ? `/register?invite=${encodeURIComponent(cleanToken)}` : '/register'}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-teal-800"
            >
              สมัครสมาชิกใหม่เพื่อเข้าร่วมทีม
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={cleanToken ? `/login?invite=${encodeURIComponent(cleanToken)}` : '/login'}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
            >
              มีบัญชีอยู่แล้ว? เข้าสู่ระบบ
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
