import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncProfile, linkProviderToUser } from '@/actions/auth';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const isLinking = searchParams.get('linking') === 'true';
  const linkingUserId = searchParams.get('linking_user_id');

  if (code) {
    const supabase = await createClient();
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
        return NextResponse.redirect(
          `${origin}/admin?linked=${provider ?? 'provider'}`,
        );
      }

      // Normal login flow: sync profile
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

      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
