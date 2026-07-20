import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/middleware';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/auth/callback', '/unauthorized', '/reset-password', '/update-password', '/temp'];

// OAuth providers that are automatically trusted (no whitelist needed)
// Users logging in via these providers are auto-registered as regular users
const AUTO_REGISTER_OAUTH_PROVIDERS = ['github', 'google', 'email'];

// Supabase auth cookies always contain one of these prefixes
const SUPABASE_COOKIE_PREFIXES = ['sb-', 'supabase-auth-'];

function hasSupabaseCookies(request: NextRequest): boolean {
  const allCookies = request.cookies.getAll();
  return allCookies.some((cookie) =>
    SUPABASE_COOKIE_PREFIXES.some((prefix) => cookie.name.startsWith(prefix)),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Guest mode check ──
  // If the user has a guest cookie, skip all auth checks and let them through
  const isGuest = request.cookies.get('guest')?.value === '1';
  if (isGuest) {
    return NextResponse.next();
  }

  // ── Early return for public routes ──
  // Avoid creating a Supabase client and writing cookies for unauthenticated/public traffic.
  // This prevents cookie header bloat that can lead to Vercel 494 REQUEST_HEADER_TOO_LARGE.
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // ── No Supabase cookies? Skip auth check entirely ──
  // If the request doesn't carry any Supabase auth cookies, the user is definitely
  // not authenticated. There's no need to call getUser() which would trigger a
  // session refresh and write new cookies (contributing to 494).
  // Just redirect to login immediately.
  if (!hasSupabaseCookies(request)) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  const { supabase, response } = await createClient(request);

  // Refresh session if expired - required for Server Components
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If not authenticated, redirect to login
  if (!user) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // ── Whitelist / Auto-register check ─────────────────────────────────
  const provider = user.app_metadata?.provider as string | undefined;

  let isAuthorized = false;

  if (provider && AUTO_REGISTER_OAUTH_PROVIDERS.includes(provider)) {
    // Google & GitHub OAuth users are automatically authorized as regular users
    // No whitelist check needed — they self-register on first login
    isAuthorized = true;
  } else if (provider === 'email') {
    // Email/password users still require whitelist approval
    const email = user.email?.toLowerCase();
    if (email) {
      const envEmails = (process.env.AUTHORIZED_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      // Check database whitelist first
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
     * - api/ routes (handle auth independently via createClient)
     * - Static assets (svg, png, jpg, jpeg, gif, webp)
     * - Common bot/crawler paths (wp-admin, wp-login, xmlrpc, .env, phpmyadmin)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|wp-admin|wp-login|xmlrpc|\\.env|phpmyadmin).*)',
  ],
};