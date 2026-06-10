import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function createClient(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Write to Response → browser gets Set-Cookie header
            supabaseResponse.cookies.set(name, value, options);
            // Write to Request → downstream Server Components / Route Handlers
            // see the FRESH session, preventing repeated refresh loops that
            // cause Vercel 494 REQUEST_HEADER_TOO_LARGE (cookie blob explosion).
            // Note: request.cookies.set in Next.js only accepts { name, value }
            // (no advanced options like path/domain/maxAge), which is fine since
            // we only need the in-memory representation to be fresh for the rest
            // of this request lifecycle.
            request.cookies.set(name, value);
          });
        },
      },
    }
  );

  return { supabase, response: supabaseResponse };
}
