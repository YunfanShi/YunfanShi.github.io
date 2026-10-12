import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchReviewSnapshot } from '@/lib/review-snapshot-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: '请重新登录。' }, { status: 401 });
  try { return NextResponse.json(await fetchReviewSnapshot(supabase, user.id), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: '复习队列读取失败，请重试。' }, { status: 503 }); }
}
