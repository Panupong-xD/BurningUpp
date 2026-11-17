import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from './client';

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

  if (!user && isProtectedPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    const inviteCode = request.nextUrl.searchParams.get('invite');
    if (inviteCode) {
      redirectUrl.searchParams.set('invite', inviteCode);
    }
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthPath) {
    const redirectUrl = request.nextUrl.clone();
    const inviteCode = request.nextUrl.searchParams.get('invite');
    if (inviteCode) {
      redirectUrl.pathname = '/onboarding';
      redirectUrl.searchParams.set('invite', inviteCode);
    } else {
      redirectUrl.pathname = '/app';
    }
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
