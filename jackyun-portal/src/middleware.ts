import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/middleware';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/auth/callback', '/unauthorized'];

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

  // Dual whitelist: GitHub username + authorized emails
  const authorizedGithubUsers = (
    process.env.AUTHORIZED_GITHUB_USERS ?? 'YunfanShi'
  )
    .split(',')
    .map((u) => u.trim().toLowerCase());

  const authorizedEmails = (process.env.AUTHORIZED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const provider = user.app_metadata?.provider as string | undefined;

  if (provider === 'github') {
    const githubUsername = (
      user.user_metadata?.user_name as string | undefined
    )?.toLowerCase();
    if (!githubUsername || !authorizedGithubUsers.includes(githubUsername)) {
      const unauthorizedUrl = new URL('/unauthorized', request.url);
      return NextResponse.redirect(unauthorizedUrl);
    }
  } else if (provider === 'email') {
    const email = user.email?.toLowerCase();
    if (!email || !authorizedEmails.includes(email)) {
      const unauthorizedUrl = new URL('/unauthorized', request.url);
      return NextResponse.redirect(unauthorizedUrl);
    }
  } else {
    // Unknown provider → unauthorized
    const unauthorizedUrl = new URL('/unauthorized', request.url);
    return NextResponse.redirect(unauthorizedUrl);
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
