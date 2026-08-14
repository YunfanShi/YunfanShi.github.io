import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/middleware';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/auth/callback', '/unauthorized', '/reset-password', '/update-password', '/temp'];

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAccountStatusRoute = pathname.startsWith('/account-status');

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

  // Verify the JWT locally when the project uses asymmetric signing keys.
  // Unlike getUser(), getClaims() does not make an Auth API request on every
  // client-side navigation (the JWKS response is cached by the SDK).
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  // If not authenticated, redirect to login
  if (!claims) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

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
      const unauthorizedUrl = new URL('/unauthorized', request.url);
      return NextResponse.redirect(unauthorizedUrl);
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
