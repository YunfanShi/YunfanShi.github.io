'use client';

import { fetchWithTimeout } from '@/lib/request-timeout';

import { createBrowserClient } from '@supabase/ssr';
import type { SetAllCookies } from '@supabase/ssr';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithTimeout },
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      cookies: {
        getAll() {
          try {
            return document.cookie.split(';').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
              const separator = entry.indexOf('=');
              const name = separator < 0 ? entry : entry.slice(0, separator);
              const rawValue = separator < 0 ? '' : entry.slice(separator + 1);
              try { return { name, value: decodeURIComponent(rawValue) }; } catch { return { name, value: rawValue }; }
            });
          } catch { return []; }
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              const pieces = [`${name}=${encodeURIComponent(value)}`, `Path=${options?.path ?? '/'}`];
              if (options?.maxAge !== undefined) pieces.push(`Max-Age=${options.maxAge}`);
              if (options?.domain) pieces.push(`Domain=${options.domain}`);
              if (options?.expires) pieces.push(`Expires=${new Date(options.expires).toUTCString()}`);
              if (options?.sameSite) pieces.push(`SameSite=${options.sameSite}`);
              if (options?.secure) pieces.push('Secure');
              document.cookie = pieces.join('; ');
            }
          } catch { /* Browser privacy settings may reject cookie writes. */ }
        },
      },
    },
  );
  return browserClient;
}
