import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const TAG = 'API/Health';

export async function GET() {
  const info: Record<string, unknown> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    buildTime: process.env.VERCEL_GIT_COMMIT_SHA ? new Date().toISOString() : 'dev',
    platform: process.platform,
    architecture: process.arch,
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local',
    env: {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  };

  // Check Supabase connection
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('user_settings').select('count', { count: 'exact', head: true });
    if (error) {
      info.supabase = { connected: false, error: error.message };
    } else {
      info.supabase = { connected: true, count: (data as unknown) ?? 'ok' };
    }
  } catch (err) {
    info.supabase = { connected: false, error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json(info);
}