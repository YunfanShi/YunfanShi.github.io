import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedUser } from '@/lib/supabase/verified-user';

const reply = (value: unknown, status = 200) => NextResponse.json(value, { status });
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const isList = (value: unknown, max: number) => Array.isArray(value) && value.length <= max;

async function owner() {
  const supabase = await createClient();
  const { data, error } = await getVerifiedUser(supabase);
  if (error || !data.user) return { error: reply({ error: 'Sign in to sync IELTS Writing workspaces.' }, 401) };
  return { supabase, userId: data.user.id };
}

export async function GET() {
  const auth = await owner();
  if ('error' in auth) return auth.error;
  const { data, error } = await auth.supabase.from('ielts_writing_workspaces').select('workspaces,error_history,archive,learning_settings,updated_at').eq('user_id', auth.userId).maybeSingle();
  if (error) return reply({ error: 'Could not read IELTS Writing sync data.' }, 503);
  return reply({ workspace: data });
}

export async function PUT(request: NextRequest) {
  const auth = await owner();
  if ('error' in auth) return auth.error;
  const body: unknown = await request.json().catch(() => null);
  if (!isObject(body) || !isList(body.workspaces, 40) || !isList(body.errorHistory, 500) || !isList(body.archive, 500) || !isObject(body.learningSettings)) return reply({ error: 'Invalid IELTS Writing sync payload.' }, 400);
  if (JSON.stringify(body).length > 4_000_000) return reply({ error: 'IELTS Writing sync payload is too large.' }, 413);
  const { error } = await auth.supabase.from('ielts_writing_workspaces').upsert({
    user_id: auth.userId,
    workspaces: body.workspaces,
    error_history: body.errorHistory,
    archive: body.archive,
    learning_settings: body.learningSettings,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) return reply({ error: 'Could not save IELTS Writing sync data.' }, 503);
  return reply({ saved: true });
}
