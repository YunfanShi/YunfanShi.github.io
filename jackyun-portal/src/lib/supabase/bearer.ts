import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

export interface BearerContext {
  supabase: SupabaseClient;
  user: User;
  token: string;
}

export async function getBearerContext(request: NextRequest): Promise<BearerContext | null> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { supabase, user: data.user, token };
}
