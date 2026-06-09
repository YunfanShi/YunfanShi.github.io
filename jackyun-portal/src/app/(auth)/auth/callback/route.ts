import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncProfile, linkProviderToUser } from '@/actions/auth';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const type = searchParams.get('type');
  const isLinking = searchParams.get('linking') === 'true';
  const linkingUserId = searchParams.get('linking_user_id');

  if (code) {
    // Determine the final redirect URL upfront based on the auth flow type,
    // then create the Response BEFORE the code exchange so Supabase can
    // write auth session cookies directly onto the redirect Response.
    // This prevents Vercel 494 REQUEST_HEADER_TOO_LARGE caused by cookies
    // not being properly included in the 302 redirect.
    let redirectUrl = `${origin}/dashboard`;  // default: normal login

    if (type === 'recovery') {
      redirectUrl = `${origin}/update-password`;
    } else if (isLinking && linkingUserId) {
      // We'll determine this after we know the provider name
      // Keep default temporarily, override after user info is available
    }

    const response = NextResponse.redirect(redirectUrl);
    const supabase = await createClient(response);
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const user = data.user;
      const provider = user.app_metadata?.provider as string | undefined;

      if (isLinking && linkingUserId) {
        // Account linking flow: associate new provider to original user
        const providerEmail =
          user.email ??
          (user.user_metadata?.email as string | undefined) ??
          '';
        await linkProviderToUser(linkingUserId, {
          provider: provider ?? 'unknown',
          providerEmail,
          providerUserId: user.id,
        });

        // Override the redirect — the cookies are already on response via createClient
        const linkResponse = NextResponse.redirect(
          `${origin}/admin?linked=${provider ?? 'provider'}`,
        );
        // Copy cookies from the original response to preserve auth session
        const existingCookies = response.cookies.getAll();
        for (const cookie of existingCookies) {
          linkResponse.cookies.set(cookie.name, cookie.value, {
            domain: cookie.domain,
            path: cookie.path,
            maxAge: cookie.maxAge,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite,
          });
        }
        return linkResponse;
      }

      // Normal login flow: sync profile (including recovery — syncProfile is also called)
      const email =
        user.email ?? (user.user_metadata?.email as string | undefined);
      const displayName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined);
      const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
      const githubUsername =
        provider === 'github'
          ? (user.user_metadata?.user_name as string | undefined)
          : undefined;

      await syncProfile(user.id, {
        provider: provider ?? 'unknown',
        email,
        displayName,
        avatarUrl,
        githubUsername,
      });

      // response already has auth cookies + correct redirect URL
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}