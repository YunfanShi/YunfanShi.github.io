import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/middleware';

// The workspace is local-first: product pages are usable without an account.
// Only administration and account-enforcement surfaces require authentication.
const AUTH_REQUIRED_ROUTES = ['/admin', '/account-status'];

// OAuth providers that are automatically trusted (no whitelist needed)
// Users logging in via these providers are auto-registered as regular users
const AUTO_REGISTER_OAUTH_PROVIDERS = ['github', 'google', 'apple'];

// Supabase auth cookies always contain one of these prefixes
const SUPABASE_COOKIE_PREFIXES = ['sb-', 'supabase-auth-'];

function hasSupabaseCookies(request: NextRequest): boolean {
  const allCookies = request.cookies.getAll();
  return allCookies.some((cookie) =>
    SUPABASE_COOKIE_PREFIXES.some((prefix) => cookie.name.startsWith(prefix)),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/techempire' || pathname.startsWith('/techempire/')) {
    const canonical = request.nextUrl.clone();
    canonical.pathname = pathname.replace(/^\/techempire/, '/Techempire');
    return NextResponse.redirect(canonical, 308);
  }
  const isAccountStatusRoute = pathname.startsWith('/account-status');
  const requiresAuth = AUTH_REQUIRED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  // ── Early return for public routes ──
  // Avoid creating a Supabase client and writing cookies for unauthenticated/public traffic.
  // This prevents cookie header bloat that can lead to Vercel 494 REQUEST_HEADER_TOO_LARGE.
  if (!requiresAuth && !hasSupabaseCookies(request)) {
    return NextResponse.next();
  }

  // ── No Supabase cookies? Skip auth check entirely ──
  // If the request doesn't carry any Supabase auth cookies, the user is definitely
  // not authenticated. There's no need to call getUser() which would trigger a
  // session refresh and write new cookies (contributing to 494).
  // Just redirect to login immediately.
  if (!hasSupabaseCookies(request)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  const { supabase, response } = await createClient(request);

  // Verify the JWT locally when the project uses asymmetric signing keys.
  // Unlike getUser(), getClaims() does not make an Auth API request on every
  // client-side navigation (the JWKS response is cached by the SDK).
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  // If not authenticated, redirect to login
  if (!claims && requiresAuth) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  if (!claims) return response;

  // ── Whitelist / Auto-register check ─────────────────────────────────
  const provider = claims.app_metadata?.provider as string | undefined;
  const email = claims.email?.toLowerCase();
  const userId = claims.sub;

  // Fetch the profile once. Previously admin pages fetched it twice and all
  // profile checks ran after the email whitelist request, creating a waterfall.
  const profilePromise = supabase
    .from('profiles')
    .select('role, account_status, deleted_at')
    .eq('id', userId)
    .maybeSingle();

  const whitelistPromise = provider === 'email' && email
    ? supabase
        .from('whitelist_emails')
        .select('id')
        .eq('email', email)
        .maybeSingle()
    : Promise.resolve({ data: null });

  const [{ data: profile }, { data: dbMatch }] = await Promise.all([
    profilePromise,
    whitelistPromise,
  ]);

  // Restricted users retain one authenticated surface for reviewing the
  // decision and talking to support. They cannot reach product data routes.
  const isRestricted = profile?.account_status === 'suspended' || Boolean(profile?.deleted_at);
  if (isRestricted) {
    if (isAccountStatusRoute) return response;
    return NextResponse.redirect(new URL('/account-status', request.url));
  }
  if (isAccountStatusRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  let isAuthorized = false;

  if (provider && AUTO_REGISTER_OAUTH_PROVIDERS.includes(provider)) {
    // Google & GitHub OAuth users are automatically authorized as regular users
    // No whitelist check needed — they self-register on first login
    isAuthorized = true;
  } else if (provider === 'email') {
    // Email/password users still require whitelist approval
    if (email) {
      const envEmails = (process.env.AUTHORIZED_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

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
    const githubUsername = (claims.user_metadata?.user_name as string | undefined)?.toLowerCase();

    const isEnvAdmin = githubUsername ? adminUsers.includes(githubUsername) : false;

    if (!isEnvAdmin && profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
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
     * - Static assets (styles, scripts, fonts, images and source maps)
     * - Common bot/crawler paths (wp-admin, wp-login, xmlrpc, .env, phpmyadmin)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:css|js|map|woff2?|ttf|otf|svg|png|jpg|jpeg|gif|webp)$|wp-admin|wp-login|xmlrpc|\\.env|phpmyadmin).*)',
  ],
};
