import { fetchWithTimeout } from '@/lib/request-timeout';
import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function createClient(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithTimeout },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          // NextResponse snapshots request headers. Rebuild AFTER updating the
          // request, otherwise downstream rendering still sees the old token.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          const previousCookies = supabaseResponse.cookies.getAll();
          supabaseResponse = NextResponse.next({ request });
          previousCookies.forEach((cookie) => supabaseResponse.cookies.set(cookie));
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  return { supabase, get response() { return supabaseResponse; } };
}
