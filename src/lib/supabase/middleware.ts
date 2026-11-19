import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from './client';

function sanitizeInviteParam(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return cleaned.length > 0 ? cleaned : null;
}

function redirectWithCookies(
  url: URL,
  sourceResponse: NextResponse
): NextResponse {
  const redirectResponse = NextResponse.redirect(url);
  sourceResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const { url, key } = getSupabaseConfig();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtectedPath =
    pathname.startsWith('/app') || pathname.startsWith('/onboarding');
  const isAuthPath =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password';

  if (isProtectedPath || pathname.startsWith('/reset-password') || pathname.startsWith('/join')) {
    supabaseResponse.headers.set('Cache-Control', 'no-store, max-age=0');
  }

  const inviteCode = sanitizeInviteParam(
    request.nextUrl.searchParams.get('invite')
  );

  if (!user && isProtectedPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    if (inviteCode) {
      redirectUrl.searchParams.set('invite', inviteCode);
    }
    return redirectWithCookies(redirectUrl, supabaseResponse);
  }

  if (user && isAuthPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.search = '';
    if (inviteCode) {
      redirectUrl.pathname = '/onboarding';
      redirectUrl.searchParams.set('invite', inviteCode);
    } else {
      redirectUrl.pathname = '/app';
    }
    return redirectWithCookies(redirectUrl, supabaseResponse);
  }

  return supabaseResponse;
}
