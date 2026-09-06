import { NextRequest, NextResponse } from 'next/server';
import { getBearerContext } from '@/lib/supabase/bearer';

export async function GET(request: NextRequest) {
  const context = await getBearerContext(request);
  if (!context) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await context.supabase.from('beta_enrollments').select('status').eq('user_id', context.user.id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, betaActive: data?.status === 'accepted' }, { headers: { 'Cache-Control': 'private, no-store' } });
}
