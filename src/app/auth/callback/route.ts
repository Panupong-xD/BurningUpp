import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const ALLOWED_NEXT_PREFIXES = ['/app', '/onboarding', '/reset-password'];

function sanitizeNextPath(rawNext: string | null): string {
  if (!rawNext) return '/app';
  // Prevent open redirects (must be a single-slash internal path on allowlist)
  if (
    !rawNext.startsWith('/') ||
    rawNext.startsWith('//') ||
    rawNext.startsWith('/\\') ||
    rawNext.includes('://') ||
    /[\r\n]/.test(rawNext)
  ) {
    return '/app';
  }
  const [pathOnly] = rawNext.split('?');
  const isAllowed = ALLOWED_NEXT_PREFIXES.some(
    (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)
  );
  return isAllowed ? rawNext : '/app';
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = sanitizeNextPath(searchParams.get('next'));

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
