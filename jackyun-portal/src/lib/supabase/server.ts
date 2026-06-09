import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function createClient(response?: NextResponse) {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          if (response) {
            // Route Handler mode: set cookies directly on the response object
            // so they are properly included in the final redirect response
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          } else {
            // Server Component / Server Action mode:
            // Use cookieStore.set() — errors can be ignored if middleware
            // handles session refreshing
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // The `setAll` method is called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          }
        },
      },
    }
  );
}
