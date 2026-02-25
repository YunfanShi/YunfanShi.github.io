import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/middleware';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/auth/callback', '/unauthorized', '/reset-password', '/update-password'];

export async function middleware(request: NextRequest) {
  const { supabase, response } = await createClient(request);

  // Refresh session if expired - required for Server Components
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return response;
  }

  // If not authenticated, redirect to login
  if (!user) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // ── Whitelist check ──────────────────────────────────────────────────
  const provider = user.app_metadata?.provider as string | undefined;

  // Env var fallbacks
  const envGithubUsers = (process.env.AUTHORIZED_GITHUB_USERS ?? 'YunfanShi')
    .split(',')
    .map((u) => u.trim().toLowerCase());
  const envEmails = (process.env.AUTHORIZED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  let isAuthorized = false;

  if (provider === 'github') {
    const githubUsername = (
      user.user_metadata?.user_name as string | undefined
    )?.toLowerCase();
    if (githubUsername) {
      // Check database first
      const { data: dbMatch } = await supabase
        .from('whitelist_usernames')
        .select('id')
        .eq('username', githubUsername)
        .eq('platform', 'github')
        .maybeSingle();
      isAuthorized = !!dbMatch || envGithubUsers.includes(githubUsername);
    }
  } else if (provider === 'google' || provider === 'email') {
    const email = user.email?.toLowerCase();
    if (email) {
      // Check database first
      const { data: dbMatch } = await supabase
        .from('whitelist_emails')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      isAuthorized = !!dbMatch || envEmails.includes(email);
    }
  }

  if (!isAuthorized) {
    const unauthorizedUrl = new URL('/unauthorized', request.url);
    return NextResponse.redirect(unauthorizedUrl);
  }

  // ── Admin route extra check ──────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    const adminUsers = (process.env.ADMIN_USERS ?? process.env.AUTHORIZED_GITHUB_USERS ?? '')
      .split(',')
      .map((u) => u.trim().toLowerCase())
      .filter(Boolean);
    const githubUsername = (
      user.user_metadata?.user_name as string | undefined
    )?.toLowerCase();

    const isEnvAdmin = githubUsername ? adminUsers.includes(githubUsername) : false;

    if (!isEnvAdmin) {
      // Check profiles table for role='admin'
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (profile?.role !== 'admin') {
        const unauthorizedUrl = new URL('/unauthorized', request.url);
        return NextResponse.redirect(unauthorizedUrl);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
